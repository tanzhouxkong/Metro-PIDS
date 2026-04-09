<template>

    <div id="slidePanel" style="flex:1; display:flex; flex-direction:column; overflow:auto; background:transparent;">
      
      <!-- Panel 1: PIDS Console -->
      <div v-if="uiState.activePanel === 'panel-1'" class="panel-body pids-ant-page" style="padding:24px 16px;">
        
        <!-- Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
            <div style="text-align:left;">
                <a-typography-title :level="4" style="margin:0; color:var(--text); letter-spacing:1px;">PIDS 控制台</a-typography-title>
                <a-typography-text type="secondary" style="font-size:12px; font-weight:600;">V2-Multi Stable</a-typography-text>
            </div>
        </div>
        
        <!-- Content -->
        <div style="display:flex; flex-direction:column; gap:20px;">
            <!-- Folder & Line Management -->
            <a-card variant="borderless" class="pids-ant-card pids-ant-card--orange">
            <div class="pids-ant-card-title pids-ant-card-title--orange">线路管理器</div>
            
            <!-- 当前线路显示 -->
            <div style="margin-bottom:12px; padding:12px; background:var(--card); border-radius:8px; border:2px solid var(--divider);">
                <div style="font-size:14px; color:var(--muted); margin-bottom:4px;">当前线路</div>
                <div style="font-size:18px; font-weight:bold; color:var(--text);">{{ pidsState.appData?.meta?.lineName || '未选择' }}</div>
            </div>
            
            <!-- 线路管理操作按钮：打开管理器 / 保存当前线路 / 压缩包 -->
            <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:10px;">
                <a-button type="primary" style="height:52px; min-height:52px; display:flex; flex-direction:row; align-items:center; justify-content:center; padding:8px 14px; background:#FF9F43 !important; border-color:#FF9F43 !important; color:#fff; border-radius:10px; font-size:15px; font-weight:600; gap:8px; box-shadow:0 4px 12px rgba(0,0,0,0.07);" @click="openLineManagerWindow()">
                    <i class="fas fa-folder-open" style="font-size:18px;"></i>打开管理器
                </a-button>
                <a-button type="default" style="height:52px; min-height:52px; display:flex; flex-direction:row; align-items:center; justify-content:center; padding:8px 14px; background:#DFE4EA; color:#2F3542; border:none; border-radius:10px; font-size:15px; font-weight:600; gap:8px; box-shadow:0 4px 12px rgba(0,0,0,0.06);" @click="openLineManagerForSave('line')">
                    <i class="fas fa-save" style="font-size:18px;"></i>保存当前线路
                </a-button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                <a-button type="primary" style="height:56px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8px; background:#9b59b6 !important; border-color:#9b59b6 !important; color:#fff; border-radius:10px; font-size:12px; gap:4px; box-shadow:0 4px 12px rgba(155,89,182,0.3);" @click="openLineManagerForSave('zip')">
                    <i class="fas fa-file-archive" style="font-size:16px;"></i> 保存为压缩包
                </a-button>
                <a-button type="primary" style="height:56px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8px; background:#3498db !important; border-color:#3498db !important; color:#fff; border-radius:10px; font-size:12px; gap:4px; box-shadow:0 4px 12px rgba(52,152,219,0.3);" @click="fileIO.loadLineFromZip()">
                    <i class="fas fa-file-import" style="font-size:16px;"></i> 从压缩包加载
                </a-button>
            </div>
        </a-card>
          
          <!-- Autoplay Control -->
          <a-card variant="borderless" class="pids-ant-card pids-ant-card--blue">
            <div class="pids-ant-card-title pids-ant-card-title--blue">自动播放</div>
            
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <span style="color:var(--text);">自动播放</span>
                <label style="position:relative; display:inline-block; width:44px; height:24px; margin:0;">
                    <input type="checkbox" :checked="isPlaying" @change="isPlaying ? stopWithUnlock() : startWithLock(settings.autoplay && settings.autoplay.intervalSec)" style="opacity:0; width:0; height:0;">
                    <span :style="{
                        position:'absolute', cursor:'pointer', top:0, left:0, right:0, bottom:0, 
                        backgroundColor: isPlaying ? 'var(--accent)' : '#ccc', 
                        transition:'.4s', borderRadius:'24px'
                    }"></span>
                    <span :style="{
                        position:'absolute', content:'', height:'18px', width:'18px', left:'3px', bottom:'3px', 
                        backgroundColor:'white', transition:'.4s', borderRadius:'50%',
                        transform: isPlaying ? 'translateX(20px)' : 'translateX(0)'
                    }"></span>
                </label>
            </div>
            
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                <span style="color:var(--muted); font-size:14px;">启用间隔:</span>
                <a-input-number v-model:value="settings.autoplay.intervalSec" :min="1" :max="3600" style="width:100px;" @change="applyAutoplayIntervalSec()" />
                <span v-if="isPlaying" style="font-size:12px; color:var(--muted);">({{ nextIn }}s)</span>
            </div>
          </a-card>
        </div>
      </div>

      <!-- Panel 4: Settings（与 PIDS 控制台同一套卡片与配色；Antdv Next 表单/按钮） -->
      <div v-if="uiState.activePanel === 'panel-4'" class="panel-body pids-ant-page pids-settings-ant" style="flex:1; display:flex; flex-direction:column; overflow:auto; background:var(--bg); padding:24px 16px; min-height:100%;">
        
        <!-- Header（与控制台一致左对齐） -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
            <div style="text-align:left;">
                <a-typography-title :level="4" style="margin:0; color:var(--text); letter-spacing:1px;">
                    {{ $t('header.settings') }}
                </a-typography-title>
                <a-typography-text type="secondary" style="font-size:12px; font-weight:600;">
                    {{ $t('preferences.title') }}
                </a-typography-text>
            </div>
        </div>
        
        
        <!-- Theme Settings -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--green">
            <div class="pids-ant-card-title pids-ant-card-title--green" style="margin-bottom:16px;">
              {{ $t('settings.appearance') }}
            </div>
            
            <div style="margin-bottom:16px;">
                <label style="display:block; font-size:13px; font-weight:bold; color:var(--muted); margin-bottom:8px;">{{ $t('settings.themeMode') }}</label>
                <div ref="themeModeDropdownRef" style="position:relative;">
                    <div
                        @click="toggleThemeModeDropdown"
                        :style="dropdownTriggerStyle"
                    >
                        <span style="font-size:13px; font-weight:600;">{{ currentThemeModeTitle }}</span>
                        <i :class="showThemeModeDropdown ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:12px; color:var(--muted);"></i>
                    </div>

                    <div
                        v-if="showThemeModeDropdown"
                        v-glassmorphism="glassDropdownDirective"
                        :style="themeModeDropdownMenuStyle"
                    >
                        <div
                            v-for="opt in themeModeOptions"
                            :key="opt.key"
                            @click="selectThemeMode(opt.key)"
                            :style="{
                                padding: '9px 10px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                color: 'var(--text)',
                                fontSize: '13px',
                                fontWeight: settings.themeMode === opt.key ? '700' : '500',
                                background: settings.themeMode === opt.key ? glassItemActiveBackground() : 'transparent'
                            }"
                            @mouseover="$event.currentTarget.style.background=glassItemHoverBackground()"
                            @mouseout="$event.currentTarget.style.background = (settings.themeMode === opt.key ? glassItemActiveBackground() : 'transparent')"
                        >
                            <span>{{ opt.title }}</span>
                            <i v-if="settings.themeMode === opt.key" class="fas fa-check" style="font-size:12px; color:var(--muted);"></i>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <span style="color:var(--text); font-size:14px;">{{ $t('settings.blur') }}</span>
                <a-switch
                    class="pids-settings-switch"
                    :checked="settings.blurEnabled !== false"
                    @update:checked="(c) => { settings.blurEnabled = c; saveSettings(); }"
                />
            </div>

            <!-- 深色模式变体 已移除 -->
        </a-card>

        <!-- Language Settings -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--sky">
            <div class="pids-ant-card-title pids-ant-card-title--sky" style="margin-bottom:16px;">
                            {{ $t('preferences.language') }}
            </div>

            <div style="margin-bottom:8px; font-size:12px; color:var(--muted);">
                {{ $t('preferences.languageHint') }}
            </div>

            <div>
                <label style="display:block; font-size:13px; font-weight:bold; color:var(--muted); margin-bottom:8px;">{{ $t('preferences.languageLabel') }}</label>
                <div ref="languageDropdownRef" style="position:relative;">
                    <div
                        @click="toggleLanguageDropdown"
                        :style="dropdownTriggerStyle"
                    >
                        <span style="font-size:13px; font-weight:600;">{{ currentLanguageTitle }}</span>
                        <i :class="showLanguageDropdown ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:12px; color:var(--muted);"></i>
                    </div>

                    <div
                        v-if="showLanguageDropdown"
                        v-glassmorphism="glassDropdownDirective"
                        :style="languageDropdownMenuStyle"
                    >
                        <div
                            v-for="opt in languageOptions"
                            :key="opt.key"
                            @click="selectLanguage(opt.key)"
                            :style="{
                                padding: '9px 10px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                color: 'var(--text)',
                                fontSize: '13px',
                                fontWeight: currentLocale === opt.key ? '700' : '500',
                                background: currentLocale === opt.key ? glassItemActiveBackground() : 'transparent'
                            }"
                            @mouseover="$event.currentTarget.style.background=glassItemHoverBackground()"
                            @mouseout="$event.currentTarget.style.background = (currentLocale === opt.key ? glassItemActiveBackground() : 'transparent')"
                        >
                            <span>{{ opt.title }}</span>
                            <i v-if="currentLocale === opt.key" class="fas fa-check" style="font-size:12px; color:var(--muted);"></i>
                        </div>
                    </div>
                </div>
            </div>
        </a-card>

                <!-- Vehicle Audio -->
                <a-card variant="borderless" class="pids-ant-card pids-ant-card--coral">
                        <div class="pids-ant-card-title pids-ant-card-title--coral" style="margin-bottom:16px;">
                            {{ $t('audio.title') }}
                        </div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
                            <div style="flex:1;">
                                <div style="color:var(--text); font-size:14px; font-weight:bold;">{{ $t('audio.enableVehicle') }}</div>
                                <div style="color:var(--muted); font-size:12px; line-height:1.5; margin-top:6px;">
                                    {{ $t('audio.enableVehicleHint') }}
                                </div>
                            </div>
                            <a-switch
                                class="pids-settings-switch"
                                :checked="settings.vehicleAudioEnabled !== false"
                                @update:checked="(c) => { settings.vehicleAudioEnabled = c; saveSettings(); }"
                            />
                        </div>
                </a-card>

        <!-- Display Management -->
        <a-card data-onboard-id="tour-settings-display-management" variant="borderless" class="pids-ant-card pids-ant-card--orange">
            <div class="pids-ant-card-title pids-ant-card-title--orange" style="margin-bottom:16px;">{{ $t('display.title') }}</div>
            
            <!-- 显示端列表标题 -->
            <div style="margin-bottom:12px;">
                <div style="font-size:14px; font-weight:bold; color:var(--text);">{{ $t('display.listTitle') }}</div>
            </div>
            
            <!-- 拖拽提示（与控制台内框一致） -->
            <div style="font-size:12px; color:var(--muted); margin-bottom:12px; padding:12px; background:rgba(255, 255, 255, 0.15); border-radius:12px; border:2px solid var(--divider);">
                <i class="fas fa-info-circle"></i> {{ $t('display.hint') }}
            </div>
            
            <!-- 显示端卡片列表 -->
            <div data-onboard-id="tour-settings-display-list" style="max-height:400px; overflow-y:auto; border:1px solid var(--divider); border-radius:12px; padding:8px; margin-bottom:16px;" @contextmenu.prevent="showDisplayContextMenu($event, null)">
                <template v-if="visibleDisplayEntries.length">
                <div v-for="[id, display] in visibleDisplayEntries" :key="id" 
                     :draggable="true"
                     :class="{ 'display-card-selected': id === displayState.currentDisplayId }"
                     @dragstart="handleDragStart($event, id)"
                     @dragend="handleDragEnd($event)"
                     @dragenter="handleDragEnter($event, id)"
                     @dragleave="handleDragLeave($event)"
                     @dragover="handleDragOver($event)"
                     @drop="handleDrop($event, id)"
                     @click="selectDisplay(id)"
                     @contextmenu.prevent="showDisplayContextMenu($event, id)"
                     :style="[
                         'display:flex; align-items:center; justify-content:space-between; padding:12px; margin-bottom:8px; background:var(--input-bg); border-radius:12px; border:2px solid var(--divider); cursor:pointer; transition:all 0.2s; user-select:none;',
                         dragOverDisplayId === id ? 'border-color: #4A90E2; background: rgba(74,144,226,0.1); transform: translateY(-2px);' : '',
                         draggedDisplayId === id ? 'opacity: 0.5;' : '',
                         !isDisplayEnabled(display) ? 'opacity: 0.5; cursor: not-allowed; background: var(--input-bg);' : ''
                     ]">
                    
                    <!-- 拖拽手柄 -->
                    <div class="display-card-muted" style="color:var(--muted); margin-right:8px; cursor:grab;" 
                         @mousedown="$event.stopPropagation()">
                        <i class="fas fa-grip-vertical"></i>
                    </div>
                    
                    <!-- 显示端信息 -->
                    <div style="flex:1; min-width:0;">
                        <div class="display-card-title" style="font-size:14px; font-weight:bold; color:var(--text); margin-bottom:4px;">
                            {{ display.nameKey && $te(display.nameKey) ? $t(display.nameKey) : (display.name || id) }}
                            <span v-if="id === displayState.currentDisplayId" class="display-card-badge" style="color:#FF9F43; font-size:12px; margin-left:8px;">
                                <i class="fas fa-star"></i> 当前
                            </span>
                        </div>
                        <div class="display-card-muted" style="font-size:12px; color:var(--muted);">
                            {{ display.source === 'builtin' ? '本地显示器' : display.source === 'online' ? '在线显示器' : display.source === 'custom' ? '自定义URL' : display.source === 'gitee' ? 'Gitee页面' : display.source }}
                            <span v-if="!isDisplayEnabled(display)" style="color:#FF6B6B; margin-left:8px;">
                                <i class="fas fa-pause"></i> 已禁用
                            </span>
                        </div>
                        <div v-if="(display.descriptionKey && $te(display.descriptionKey)) || display.description" class="display-card-muted" style="font-size:11px; color:var(--muted); margin-top:2px;">
                            {{ display.descriptionKey && $te(display.descriptionKey) ? $t(display.descriptionKey) : display.description }}
                        </div>
                    </div>

                </div>
                </template>
            </div>

            <!-- 批量操作 -->
            <div style="display:flex; gap:10px;">
                <a-button type="primary" class="pids-settings-ant-btn" style="flex:1; min-width:0; background:#2ED573 !important; border-color:#2ED573 !important; color:#fff !important; padding:10px; border-radius:6px; font-weight:bold;" @click="openAllDisplays()">
                    <i class="fas fa-window-restore"></i>{{ $t('display.openAll') }}
                </a-button>
                <a-button type="primary" danger class="pids-settings-ant-btn" style="flex:1; min-width:0; background:#FF6B6B !important; border-color:#FF6B6B !important; color:#fff !important; padding:10px; border-radius:6px; font-weight:bold;" @click="closeAllDisplays()">
                    <i class="fas fa-times-circle"></i>{{ $t('display.closeAll') }}
                </a-button>
            </div>
        </a-card>

        <!-- API Server Settings -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--violet">
            <div class="pids-ant-card-title pids-ant-card-title--violet" style="margin-bottom:16px;">{{ $t('api.title') }}</div>
            
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="flex:1;">
                    <div style="color:var(--text); font-size:14px; font-weight:bold; margin-bottom:4px;">{{ $t('api.enable') }}</div>
                    <div style="font-size:12px; color:var(--muted); line-height:1.5;">
                        {{ $t('api.tip1') }}<br>
                        {{ $t('api.tip2') }}
                    </div>
                </div>
                <a-switch
                    class="pids-settings-switch"
                    style="margin-left:16px; flex-shrink:0;"
                    :checked="!!settings.enableApiServer"
                    @update:checked="(c) => { settings.enableApiServer = c; saveSettings(); }"
                />
            </div>

            <div style="font-size:12px; color:var(--muted); background:rgba(155,89,182,0.12); padding:10px; border-radius:6px; border:1px solid rgba(155,89,182,0.25); line-height:1.6;">
                <i class="fas fa-info-circle" style="margin-right:6px; color:#9B59B6;"></i>
                {{ $t('api.tip3') }}
            </div>
        </a-card>

        <!-- LAN WebSocket Bridge -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--emerald">
            <div class="pids-ant-card-title pids-ant-card-title--emerald" style="margin-bottom:16px;">{{ $t('multiScreen.title') }}</div>

            <div style="margin-bottom:12px; color:var(--text); font-size:14px; font-weight:bold;">{{ $t('multiScreen.entryTitle') }}</div>

            <div style="font-size:12px; color:var(--muted); line-height:1.7; background:rgba(39,174,96,0.1); border:1px solid rgba(39,174,96,0.2); padding:12px; border-radius:8px; margin-bottom:12px;">
                {{ $t('multiScreen.entryDesc1') }}
                <br>{{ $t('multiScreen.entryDesc2') }}
            </div>

            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                <a-input :value="multiScreenEntryUrl" readonly style="flex:1; min-width:260px; font-family:Consolas, monospace; font-size:12px;" />
                <a-button type="primary" class="pids-settings-ant-btn" style="background:#2d98da !important; border-color:#2d98da !important; color:#fff !important; padding:8px 10px; border-radius:6px;" @click="copyMultiScreenEntryUrl">
                    <i class="fas fa-copy"></i>{{ $t('multiScreen.copyAddress') }}
                </a-button>
                <a-button type="primary" class="pids-settings-ant-btn" style="background:#27ae60 !important; border-color:#27ae60 !important; color:#fff !important; padding:8px 10px; border-radius:6px;" @click="openMultiScreenQrDialog">
                    <i class="fas fa-qrcode"></i>{{ $t('multiScreen.showQr') }}
                </a-button>
            </div>

            <div style="margin-top:8px; font-size:12px; color:var(--muted); line-height:1.6;">
                {{ $t('multiScreen.tips1') }}
            </div>
        </a-card>

        <!-- Keybindings -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--blue">
            <div class="pids-ant-card-title pids-ant-card-title--blue" style="margin-bottom:16px;">{{ $t('keys.title') }}</div>
            
            <div style="display:flex; flex-direction:column; gap:12px;">
                <div v-for="(val, key) in keyMapDisplay" :key="key" style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px dashed var(--divider);">
                    <span style="font-size:14px; color:var(--text);">{{ val.label }}</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <a-input
                            :value="settings.keys[key]"
                            readonly
                            :placeholder="$t('keys.placeholder')"
                            style="width:100px; text-align:center; cursor:pointer; font-family:monospace; font-weight:bold; padding:6px 10px; color:var(--accent);"
                            @keydown="recordKey(key, $event)"
                        />
                        <a-button class="pids-settings-ant-btn" style="background:var(--btn-gray-bg) !important; border-color:var(--divider) !important; color:var(--text) !important; padding:6px 10px; border-radius:6px;" title="清除快捷键" @click="clearKey(key)">
                            <i class="fas fa-times"></i>
                        </a-button>
                    </div>
                </div>
            </div>
            
            <div class="settings-hint-box" style="margin-top:16px; font-size:12px; color:var(--muted); padding:12px; border-radius:8px; margin-bottom:12px; border:2px solid var(--divider);">
                <i class="fas fa-info-circle"></i> {{ $t('keys.editHint') }}
            </div>

            <a-button type="primary" danger block class="pids-settings-ant-btn" style="width:100%; background:var(--btn-red-bg) !important; border-color:var(--btn-red-bg) !important; color:#fff !important; padding:10px; border-radius:6px; font-weight:bold;" @click="resetKeys()">
                <i class="fas fa-undo"></i>{{ $t('keys.resetAll') }}
            </a-button>
        </a-card>

        <!-- Version & Update -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--indigo">
            <div class="pids-ant-card-title pids-ant-card-title--indigo" style="margin-bottom:12px;">{{ $t('about.versionTitle') }}</div>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="font-size:14px; color:var(--text);">{{ $t('about.currentVersion') }}</div>
                <div style="font-weight:bold; color:var(--muted);">{{ version }}</div>
            </div>
            <div style="display:flex; gap:12px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
                <a-button type="primary" class="pids-settings-ant-btn" style="flex:0 0 auto; background:#2d98da !important; border-color:#2d98da !important; color:#fff !important; padding:8px 12px; border-radius:6px;" @click="checkForUpdateClicked()">{{ $t('about.checkUpdate') }}</a-button>
                <a-button type="primary" class="pids-settings-ant-btn" style="flex:0 0 auto; background:#95a5a6 !important; border-color:#95a5a6 !important; color:#fff !important; padding:8px 12px; border-radius:6px;" @click="openReleaseNotes()">
                    <i class="fas fa-list-alt"></i>{{ $t('about.viewLog') }}
                </a-button>
                <div v-if="updateState.checking" style="font-size:12px; color:var(--muted);">{{ $t('about.update.checking') }}</div>
                <div v-else-if="updateState.error" style="font-size:12px; color:#e74c3c;">{{ $t('about.update.error', { error: updateState.error }) }}</div>
                <div v-else-if="updateState.isLatest" style="font-size:12px; color:#2ed573;">{{ $t('about.update.isLatest') }}</div>
                <div v-else-if="updateState.available && !updateState.downloading && !updateState.downloaded" style="font-size:12px; color:#4b7bec;">
                    {{ $t('about.update.foundNew', { version: (updateState.info && updateState.info.version) ? updateState.info.version : '' }) }}
                </div>
                <div v-else-if="updateState.downloaded" style="font-size:12px; color:#2ed573;">{{ $t('about.update.downloadReady') }}</div>
                <div v-else-if="updateState.downloading" style="font-size:12px; color:var(--muted);">
                    {{ $t('about.update.downloading', { progress: updateState.progress }) }}
                    <span v-if="updateState.error && (updateState.error.includes('checksum') || updateState.error.includes('sha512'))" style="color:#ffa502; margin-left:8px;">
                        <i class="fas fa-sync-alt" style="animation:spin 1s linear infinite;"></i> {{ $t('about.update.downloadingRetrying') }}
                    </span>
                </div>
            </div>
            <div v-if="updateState.available && !updateState.downloaded" style="display:flex; gap:10px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
                <a-button type="primary" class="pids-settings-ant-btn" style="background:#3867d6 !important; border-color:#3867d6 !important; color:#fff !important; padding:8px 12px; border-radius:6px;" :disabled="updateState.downloading" @click="downloadUpdateNow()">
                    <i class="fas fa-download"></i>{{ $t('about.update.downloadButton') }}
                </a-button>
                <a-button v-if="updateState.error && (updateState.error.includes('checksum') || updateState.error.includes('sha512'))" type="primary" class="pids-settings-ant-btn" style="background:#ffa502 !important; border-color:#ffa502 !important; color:#fff !important; padding:8px 12px; border-radius:6px;" :disabled="updateState.downloading" @click="clearCacheAndRedownload()">
                    <i class="fas fa-redo"></i>{{ $t('about.update.clearCacheAndRedownload') }}
                </a-button>
                <a-button type="primary" class="pids-settings-ant-btn" style="background:#2ecc71 !important; border-color:#2ecc71 !important; color:#fff !important; padding:8px 12px; border-radius:6px;" title="如果自动下载失败，可以从GitHub手动下载" @click="openGitHubReleases()">
                    <i class="fab fa-github"></i>{{ $t('about.update.githubManualDownload') }}
                </a-button>
                <a-button type="primary" class="pids-settings-ant-btn" style="background:#95a5a6 !important; border-color:#95a5a6 !important; color:#fff !important; padding:8px 12px; border-radius:6px;" :disabled="updateState.downloading" @click="skipThisVersion()">
                    <i class="fas fa-times"></i>{{ $t('about.update.skipThisVersion') }}
                </a-button>
            </div>
            <div v-if="updateState.downloaded" style="margin-bottom:10px;">
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
                <a-button type="primary" class="pids-settings-ant-btn" style="background:#20bf6b !important; border-color:#20bf6b !important; color:#fff !important; padding:8px 12px; border-radius:6px; font-weight:bold;" @click="installDownloadedUpdate()">
                        <i class="fas fa-redo"></i>{{ $t('about.update.restartNow') }}
                </a-button>
                </div>
                <div style="font-size:11px; color:var(--muted); line-height:1.4; padding:6px 8px; background:rgba(32,191,107,0.1); border-radius:4px;">
                    <i class="fas fa-info-circle" style="margin-right:4px;"></i>
                    {{ $t('about.update.updateReadyHint') }}
                </div>
            </div>
            <div v-if="updateState.downloading" style="margin-top:10px;">
                <div class="settings-progress-bg" style="width:100%; height:12px; border-radius:6px; overflow:hidden; margin-bottom:6px;">
                    <div :style="{ width: updateState.progress + '%', height:'100%', background:'linear-gradient(90deg, #4b7bec 0%, #2d98da 100%)', transition:'width .3s ease', boxShadow:'0 0 10px rgba(75,123,236,0.3)' }"></div>
                </div>
                <div style="text-align:center; font-size:12px; color:var(--muted);">
                    {{ $t('about.update.downloadProgress', { 
                        progress: updateState.progress, 
                        version: (updateState.info && updateState.info.version) ? updateState.info.version : '' 
                    }) }}
                </div>
            </div>

            <div style="margin-top:14px; padding-top:12px; border-top:1px dashed var(--divider); display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                <div>
                    <div style="font-size:13px; color:var(--text); font-weight:700;">{{ $t('about.onboarding.title') }}</div>
                    <div style="font-size:12px; color:var(--muted); margin-top:2px;">{{ $t('about.onboarding.hint') }}</div>
                </div>
                <a-button type="primary" class="pids-settings-ant-btn" style="background:#e67e22 !important; border-color:#e67e22 !important; color:#fff !important; padding:8px 12px; border-radius:6px;" @click="resetOnboardingGuide()">
                    <i class="fas fa-undo"></i>{{ $t('about.onboarding.resetButton') }}
                </a-button>
            </div>
        </a-card>

        <!-- 反馈与交流 -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--teal">
            <div class="pids-ant-card-title pids-ant-card-title--teal" style="margin-bottom:16px;"><i class="fas fa-comments" style="margin-right:8px;"></i>{{ $t('about.feedbackTitle') }}</div>
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                    <span style="font-size:14px; color:var(--text);">{{ $t('about.qqGroup') }}</span>
                    <a href="#" role="button" @click.prevent="openExternalUrl('https://qm.qq.com/cgi-bin/qm/qr?k=quYCch8XYudKFgBdJ3gLvq2lU4y6PHym&jump_from=webapi&authKey=O7TRvoSNVxt66yyv7U/3tFAvp1eeKTMpAwutOkKyPEJbD1jKVikjkeTcbZwVsBYi')" style="display:inline-flex; align-items:center; gap:6px; color:var(--accent); text-decoration:none; font-weight:600; cursor:pointer;">
                        <img border="0" src="https://pub.idqqimg.com/wpa/images/group.png" :alt="$t('about.qqGroupName')" :title="$t('about.qqGroupName')" style="height:24px; width:auto; vertical-align:middle;">
                        {{ $t('about.qqGroupName') }}
                    </a>
                </div>
                <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                    <span style="font-size:14px; color:var(--text);">{{ $t('about.githubIssue') }}</span>
                    <a href="#" role="button" @click.prevent="openExternalUrl('https://github.com/tanzhouxkong/Metro-PIDS/issues')" style="display:inline-flex; align-items:center; gap:6px; color:var(--accent); text-decoration:none; font-weight:600; cursor:pointer;">
                        <i class="fab fa-github" style="font-size:18px;"></i>
                        {{ $t('about.githubIssueDesc') }}
                    </a>
                </div>
            </div>
        </a-card>

      </div>

    </div>

    <!-- Color Picker Dialog -->
    <ColorPicker 
      v-model="showColorPicker" 
      :initial-color="colorPickerInitialColor"
      @confirm="onColorConfirm"
    />

    <!-- Edit Display Dialog（与 StationEditor：Teleport + cp-overlay / cp-dialog + v-glassmorphism） -->
    <Teleport to="body">
        <Transition name="cp-fade">
            <div v-if="showDisplayEditDialog" class="cp-overlay cp-overlay--editor" @click.self="closeDisplayEditDialog">
                <div
                    class="cp-dialog cp-dialog--editor"
                    v-glassmorphism="{ blur: 12, opacity: 0.2, color: '#ffffff' }"
                    role="dialog"
                    aria-modal="true"
                    @mousedown.stop
                    @click.stop
                >
                    <div class="cp-header">
                        <div class="cp-header-left">
                            <div class="cp-icon">
                                <i class="fas fa-edit"></i>
                            </div>
                            <div class="cp-titles">
                                <div class="cp-title">{{ $t("display.editTitle") }}</div>
                                <div class="cp-subtitle">{{ displayEdit.name || 'Edit Display' }}</div>
                            </div>
                        </div>
                        <button type="button" class="cp-close" @click="closeDisplayEditDialog" aria-label="关闭">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="cp-content cp-content--scroll" style="display:flex; flex-direction:column; gap:12px;">
                        <template v-if="!displayEdit.isSystem">
                            <div>
                                <label class="se-label">{{ $t("display.editName") }}</label>
                                <input v-model="displayEdit.name" type="text" class="se-input" placeholder="例如：主显示器">
                            </div>
                            <div>
                                <label class="se-label">{{ $t("display.sourceLabel") }}</label>
                                <div ref="displaySourceDropdownRef" style="position:relative;" class="custom-dropdown-container">
                                    <div
                                        @click.stop="toggleDisplaySourceDropdown"
                                        :style="dropdownTriggerStyle"
                                    >
                                        <span style="font-size:13px; font-weight:600;">{{ currentDisplaySourceTitle }}</span>
                                        <i :class="showDisplaySourceDropdown ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:12px; color:var(--muted);"></i>
                                    </div>
                                    <transition name="dropdown-fade">
                                        <div
                                            v-show="showDisplaySourceDropdown"
                                            v-glassmorphism="glassDropdownDirective"
                                            :style="displaySourceDropdownMenuStyle"
                                            @click.stop
                                        >
                                            <div
                                                v-for="opt in displaySourceOptions"
                                                :key="opt.value"
                                                @click.stop="selectDisplaySource(opt.value)"
                                                :style="{
                                                    padding: '9px 10px',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    color: 'var(--text)',
                                                    fontSize: '13px',
                                                    fontWeight: displayEdit.source === opt.value ? '700' : '500',
                                                    background: displayEdit.source === opt.value ? glassItemActiveBackground() : 'transparent'
                                                }"
                                                @mouseover="$event.currentTarget.style.background=glassItemHoverBackground()"
                                                @mouseout="$event.currentTarget.style.background = (displayEdit.source === opt.value ? glassItemActiveBackground() : 'transparent')"
                                            >
                                                <span>{{ opt.title }}</span>
                                                <i v-if="displayEdit.source === opt.value" class="fas fa-check" style="font-size:12px; color:var(--muted);"></i>
                                            </div>
                                        </div>
                                    </transition>
                                </div>
                            </div>
                            <div v-show="displayEdit.source === 'builtin'">
                                <label class="se-label">本地网页文件</label>
                                <div style="display:flex; gap:10px;">
                                    <input v-model="displayEdit.url" type="text" readonly class="se-input" style="flex:1;" placeholder="请选择本地HTML文件">
                                    <button type="button" class="se-btn se-btn-green" style="min-width:auto; white-space:nowrap;" @click="pickDisplayEditFile()"><i class="fas fa-folder-open" style="margin-right:6px;"></i>选择文件</button>
                                </div>
                            </div>
                            <div v-show="displayEdit.source !== 'builtin'">
                                <label class="se-label">在线URL</label>
                                <input v-model="displayEdit.url" type="text" class="se-input" placeholder="https://example.com/display.html">
                            </div>
                            <div>
                                <label class="se-label">描述 <span style="font-weight:normal; color:var(--muted); font-size:11px;">(可选)</span></label>
                                <input v-model="displayEdit.description" type="text" class="se-input" placeholder="显示端描述">
                            </div>
                        </template>

                        <template v-if="displayEdit.isDisplay1">
                            <div class="se-display-option-row">
                                <div class="se-display-option-text">
                                    <div class="se-label" style="margin-bottom:4px;">{{ $t("display.lineNameMerge") }}</div>
                                    <div class="se-display-option-desc">{{ $t("display.lineNameMergeDesc") }}</div>
                                </div>
                                <label class="se-toggle-wrap">
                                    <input v-model="displayEdit.lineNameMerge" type="checkbox" class="se-toggle-input">
                                    <span class="se-toggle-track" :class="{ on: displayEdit.lineNameMerge }"></span>
                                    <span class="se-toggle-thumb" :class="{ on: displayEdit.lineNameMerge }"></span>
                                </label>
                            </div>
                            <div class="se-display-option-row">
                                <div class="se-display-option-text">
                                    <div class="se-label" style="margin-bottom:4px;">C型开关</div>
                                    <div class="se-display-option-desc">开启时底部线路图为 C 型，关闭时为直线</div>
                                </div>
                                <label class="se-toggle-wrap">
                                    <input v-model="displayEdit.layoutMode" type="checkbox" class="se-toggle-input" true-value="c-type" false-value="linear">
                                    <span class="se-toggle-track" :class="{ on: displayEdit.layoutMode === 'c-type' }"></span>
                                    <span class="se-toggle-thumb" :class="{ on: displayEdit.layoutMode === 'c-type' }"></span>
                                </label>
                            </div>
                            <div class="se-display-option-row" style="align-items:flex-start;">
                                <div class="se-display-option-text" style="flex:1;">
                                    <div class="se-label" style="margin-bottom:4px;">壁纸</div>
                                    <div class="se-display-option-desc">仅用于到站/结束页背景，可调透明度</div>
                                    <div style="margin-top:10px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                        <button type="button" class="se-btn se-btn-green" style="min-width:auto; white-space:nowrap;" @click="pickDisplay1Wallpaper()">
                                            <i class="fas fa-image" style="margin-right:6px;"></i>上传图片
                                        </button>
                                        <button type="button" class="se-btn se-btn-gray" style="min-width:auto; white-space:nowrap;" @click="clearDisplay1Wallpaper()" :disabled="!displayEdit.wallpaperDataUrl">
                                            <i class="fas fa-eraser" style="margin-right:6px;"></i>清除
                                        </button>
                                        <input ref="display1WallpaperInput" type="file" accept="image/*" style="display:none;" @change="onDisplay1WallpaperFileChange" />
                                    </div>
                                    <div style="margin-top:10px; display:flex; align-items:center; gap:10px;">
                                        <div style="font-size:12px; color:var(--muted); width:54px; flex:0 0 auto;">透明度</div>
                                        <input v-model.number="displayEdit.wallpaperOpacity" type="range" min="0" max="1" step="0.01" style="flex:1; cursor:pointer;">
                                        <div style="font-size:12px; color:var(--text); font-weight:700; width:52px; text-align:right;">
                                            {{ Math.round((displayEdit.wallpaperOpacity || 0) * 100) }}%
                                        </div>
                                    </div>
                                </div>
                                <div style="width:120px; flex:0 0 auto;">
                                    <div :style="{
                                            width:'120px', height:'68px', borderRadius:'10px',
                                            border:'1px solid rgba(0,0,0,0.12)',
                                            background: displayEdit.wallpaperDataUrl ? 'center / cover no-repeat url(' + displayEdit.wallpaperDataUrl + ')' : 'linear-gradient(135deg, rgba(0,0,0,0.05), rgba(0,0,0,0.02))',
                                            opacity: 1,
                                            boxShadow:'0 6px 18px rgba(0,0,0,0.10)'
                                        }">
                                    </div>
                                </div>
                            </div>
                        </template>
                        <template v-if="displayEdit.isDisplay2">
                            <div class="se-display-option-row">
                                <div class="se-display-option-text">
                                    <div class="se-label" style="margin-bottom:4px;">{{ $t("display.display2UiVariant") }}</div>
                                    <div class="se-display-option-desc">{{ $t("display.display2UiVariantDesc") }}</div>
                                </div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <div ref="uiVariantDropdownRef" style="position:relative; width:160px;" class="custom-dropdown-container">
                                        <div
                                            @click.stop="toggleUiVariantDropdown"
                                            class="se-input"
                                            :style="dropdownTriggerStyle"
                                        >
                                            <span style="font-size:13px; font-weight:500;">{{ displayEdit.display2UiVariant === 'classic' ? $t('display.display2UiVariantClassic') : $t('display.display2UiVariantModern') }}</span>
                                            <i class="fas fa-chevron-down" style="font-size:12px; color:var(--muted); transition: transform 0.2s" 
                                               :style="{ transform: showUiVariantDropdown ? 'rotate(180deg)' : 'rotate(0deg)' }"></i>
                                        </div>
                                        <transition name="dropdown-fade">
                                            <div
                                                v-show="showUiVariantDropdown"
                                                v-glassmorphism="glassDropdownDirective"
                                                :style="uiVariantDropdownMenuStyle"
                                                @click.stop
                                            >
                                                <div 
                                                    @click.stop="selectUiVariant('classic')"
                                                    style="padding:8px 12px; border-radius:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;"
                                                    :style="{ 
                                                        fontWeight: displayEdit.display2UiVariant === 'classic' ? '700' : '500',
                                                        background: displayEdit.display2UiVariant === 'classic' ? glassItemActiveBackground() : 'transparent',
                                                        color: 'var(--text)'
                                                    }"
                                                    @mouseover="$event.currentTarget.style.background=glassItemHoverBackground()"
                                                    @mouseout="$event.currentTarget.style.background=(displayEdit.display2UiVariant === 'classic' ? glassItemActiveBackground() : 'transparent')"
                                                >
                                                    <span style="font-size:13px">{{ $t('display.display2UiVariantClassic') }}</span>
                                                    <i v-if="displayEdit.display2UiVariant === 'classic'" class="fas fa-check" style="color:var(--muted); font-size:12px;"></i>
                                                </div>
                                                <div 
                                                    @click.stop="selectUiVariant('modern')"
                                                    style="padding:8px 12px; border-radius:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;"
                                                    :style="{ 
                                                        fontWeight: displayEdit.display2UiVariant === 'modern' ? '700' : '500',
                                                        background: displayEdit.display2UiVariant === 'modern' ? glassItemActiveBackground() : 'transparent',
                                                        color: 'var(--text)'
                                                    }"
                                                    @mouseover="$event.currentTarget.style.background=glassItemHoverBackground()"
                                                    @mouseout="$event.currentTarget.style.background=(displayEdit.display2UiVariant === 'modern' ? glassItemActiveBackground() : 'transparent')"
                                                >
                                                    <span style="font-size:13px">{{ $t('display.display2UiVariantModern') }}</span>
                                                    <i v-if="displayEdit.display2UiVariant === 'modern'" class="fas fa-check" style="color:var(--muted); font-size:12px;"></i>
                                                </div>
                                            </div>
                                        </transition>
                                    </div>
                                </div>
                            </div>
                            <div class="se-display-option-row">
                                <div class="se-display-option-text">
                                    <div class="se-label" style="margin-bottom:4px;">{{ $t("display.nextStationDuration") }}</div>
                                    <div class="se-display-option-desc">{{ $t("display.nextStationDurationDesc") }}</div>
                                </div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <input v-model.number="displayEdit.nextStationDurationSeconds" type="number" min="1" max="60" step="1" class="se-input" style="width:100px; text-align:right;">
                                    <span style="font-size:14px; color:var(--text); font-weight:500;">秒</span>
                                </div>
                            </div>
                        </template>
                        <template v-if="displayEdit.isDisplay3">
                            <!-- 当前车厢：独立一行 -->
                            <div class="se-display-option-row">
                                <div class="se-display-option-text">
                                    <div class="se-label" style="margin-bottom:4px;">{{ $t('display.display3ActiveCar') }}</div>
                                    <div class="se-display-option-desc">{{ $t('display.display3ActiveCarDesc') }}</div>
                                </div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <div ref="activeCarDropdownRef" style="position:relative; width:160px;" class="custom-dropdown-container">
                                        <div
                                            @click.stop="toggleActiveCarDropdown"
                                            :style="dropdownTriggerStyle"
                                        >
                                            <span style="font-size:13px; font-weight:600;">
                                                {{ $t('display.display3ActiveCarOption', { n: displayEdit.activeCarNo || 1 }) }}
                                            </span>
                                            <i :class="showActiveCarDropdown ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:12px; color:var(--muted);"></i>
                                        </div>
                                        <transition name="dropdown-fade">
                                            <div
                                                v-show="showActiveCarDropdown"
                                                v-glassmorphism="glassDropdownDirective"
                                                :style="activeCarDropdownMenuStyle"
                                                @click.stop
                                            >
                                                <div
                                                    v-for="n in (display3TrainFormationOptions.find(o => o.value === displayEdit.trainFormation)?.groups.reduce((sum, g) => sum + g, 0) || 6)"
                                                    :key="'car-'+n"
                                                    @click.stop="selectActiveCar(n)"
                                                    :style="{
                                                        padding: '9px 10px',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        color: 'var(--text)',
                                                        fontSize: '13px',
                                                        fontWeight: displayEdit.activeCarNo === n ? '700' : '500',
                                                        background: displayEdit.activeCarNo === n ? glassItemActiveBackground() : 'transparent'
                                                    }"
                                                    @mouseover="$event.currentTarget.style.background=glassItemHoverBackground()"
                                                    @mouseout="$event.currentTarget.style.background = (displayEdit.activeCarNo === n ? glassItemActiveBackground() : 'transparent')"
                                                >
                                                    <span>{{ $t('display.display3ActiveCarOption', { n }) }}</span>
                                                    <i v-if="displayEdit.activeCarNo === n" class="fas fa-check" style="font-size:12px; color:var(--muted);"></i>
                                                </div>
                                            </div>
                                        </transition>
                                    </div>
                                </div>
                            </div>
                        </template>
                        <!-- 屏幕位置：独立一行（显示器1 / 3 共用） -->
                        <div v-if="displayEdit.isDisplay1 || displayEdit.isDisplay3" class="se-display-option-row">
                                <div class="se-display-option-text">
                                    <div class="se-label" style="margin-bottom:4px;">{{ $t('display.display3VirtualPos') }}</div>
                                    <div class="se-display-option-desc">{{ $t('display.display3VirtualPosDesc') }}</div>
                                </div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <div ref="virtualPosDropdownRef" style="position:relative; width:160px;" class="custom-dropdown-container">
                                        <div
                                            @click.stop="toggleVirtualPosDropdown"
                                            :style="dropdownTriggerStyle"
                                        >
                                            <span style="font-size:13px; font-weight:600;">
                                                {{ virtualPosTitle }}
                                            </span>
                                            <i :class="showVirtualPosDropdown ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:12px; color:var(--muted);"></i>
                                        </div>
                                        <transition name="dropdown-fade">
                                            <div
                                                v-show="showVirtualPosDropdown"
                                                v-glassmorphism="glassDropdownDirective"
                                                :style="virtualPosDropdownMenuStyle"
                                                @click.stop
                                            >
                                                <div
                                                    v-for="opt in virtualPosOptions"
                                                    :key="opt.value"
                                                    @click.stop="selectVirtualPos(opt.value)"
                                                    :style="{
                                                        padding: '9px 10px',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        color: 'var(--text)',
                                                        fontSize: '13px',
                                                        fontWeight: displayEdit.virtualPosition === opt.value ? '700' : '500',
                                                        background: displayEdit.virtualPosition === opt.value ? glassItemActiveBackground() : 'transparent'
                                                    }"
                                                    @mouseover="$event.currentTarget.style.background=glassItemHoverBackground()"
                                                    @mouseout="$event.currentTarget.style.background = (displayEdit.virtualPosition === opt.value ? glassItemActiveBackground() : 'transparent')"
                                                >
                                                    <span>{{ $t(opt.labelKey) }}</span>
                                                    <i v-if="displayEdit.virtualPosition === opt.value" class="fas fa-check" style="font-size:12px; color:var(--muted);"></i>
                                                </div>
                                            </div>
                                        </transition>
                                    </div>
                                </div>
                           </div>
                        

                        <!-- 显示器3：车辆编组（图标按钮组，放最底部） -->
                        <div v-if="displayEdit.isDisplay3" class="se-display-option-row" style="flex-direction:column; align-items:stretch; gap:10px;">
                            <div class="se-display-option-text" style="max-width:none;">
                                <div class="se-label" style="margin-bottom:4px;">{{ $t('display.display3TrainFormation') }}</div>
                                <div class="se-display-option-desc">{{ $t('display.display3TrainFormationDesc') }}</div>
                            </div>
                            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                                    <button
                                        v-for="item in display3TrainFormationOptions"
                                        :key="'tf-'+item.value"
                                        type="button"
                                        @click.stop="selectTrainFormation(item.value)"
                                        :title="$t(item.labelKey)"
                                        :aria-pressed="displayEdit.trainFormation === item.value"
                                        :style="[dropdownTriggerStyle, {
                                            width: '104px',
                                            minWidth: '104px',
                                            height: '56px',
                                            padding: '8px 10px',
                                            borderRadius: '12px',
                                            justifyContent: 'center',
                                            background: (displayEdit.trainFormation === item.value ? glassItemActiveBackground() : glassMenuBackground()),
                                            flexDirection: 'column',
                                            gap: '6px'
                                        }]"
                                        @mouseover="displayEdit.trainFormation !== item.value && ($event.currentTarget.style.background = glassItemHoverBackground())"
                                        @mouseout="displayEdit.trainFormation !== item.value && ($event.currentTarget.style.background = glassMenuBackground())"
                                    >
                                        <div style="display:flex; align-items:center; gap:6px;">
                                            <div
                                                v-for="(g, gi) in item.groups"
                                                :key="item.value + '-g-' + gi"
                                                :style="{ display: 'flex', alignItems: 'center', gap: '2px', marginRight: gi < item.groups.length - 1 ? '6px' : '0' }"
                                            >
                                                <span
                                                    v-for="k in g"
                                                    :key="item.value + '-g-' + gi + '-c-' + k"
                                                    :style="{
                                                        width: '8px',
                                                        height: '12px',
                                                        borderRadius: '3px',
                                                        border: '1px solid ' + (displayEdit.trainFormation === item.value ? 'var(--text)' : 'var(--muted)'),
                                                        background: displayEdit.trainFormation === item.value ? 'var(--text)' : 'transparent',
                                                        opacity: displayEdit.trainFormation === item.value ? 0.9 : 0.7,
                                                        boxSizing: 'border-box'
                                                    }"
                                                ></span>
                                            </div>
                                        </div>
                                        <div :style="{
                                            fontSize: '11px',
                                            fontWeight: '800',
                                            color: 'var(--text)',
                                            opacity: (displayEdit.trainFormation === item.value ? 1 : 0.85),
                                            textAlign: 'center',
                                            width: '100%',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }">
                                            {{ $t(item.labelKey) }}
                                        </div>
                                    </button>
                            </div>
                        </div>
                    </div>

                    <div class="cp-footer cp-footer--end">
                        <button type="button" class="cp-btn cp-btn-gray" @click="closeDisplayEditDialog">{{ $t("display.btnCancel") }}</button>
                        <button type="button" class="cp-btn cp-btn-primary" @click="saveDisplayEdit">{{ $t("display.btnSave") }}</button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>

    <!-- Multi-Screen QR Dialog -->
    <Teleport to="body">
        <Transition name="cp-fade">
            <div v-if="showMultiScreenQrDialog" class="cp-overlay cp-overlay--editor" @click.self="closeMultiScreenQrDialog">
                <div class="cp-dialog cp-dialog--compact" v-glassmorphism="glassDropdownDirective" role="dialog" aria-modal="true">
                    <div class="cp-header">
                        <div class="cp-header-left">
                            <div class="cp-icon">
                                <i class="fas fa-qrcode"></i>
                            </div>
                            <div class="cp-titles">
                                <div class="cp-title">{{ $t('multiScreen.qrDialogTitle') }}</div>
                                <div class="cp-subtitle">{{ $t('multiScreen.qrDialogSubtitle') }}</div>
                            </div>
                        </div>
                        <button type="button" class="cp-close" @click="closeMultiScreenQrDialog" aria-label="关闭">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="cp-content" style="display:flex; flex-direction:column; align-items:center; gap:12px;">
                        <div style="padding:14px; border-radius:14px; border:1px solid var(--divider); background:var(--input-bg); box-shadow:0 4px 14px rgba(0,0,0,0.08);">
                            <img :src="multiScreenQrUrl" :alt="$t('multiScreen.qrDialogTitle')" style="display:block; width:280px; height:280px; object-fit:contain; border-radius:8px;">
                        </div>
                        <div style="width:100%; font-size:12px; color:var(--muted); line-height:1.6; text-align:center; word-break:break-all;">
                            {{ multiScreenEntryUrl }}
                        </div>
                    </div>

                    <div class="cp-footer cp-footer--end">
                        <div class="cp-footer-right">
                            <button type="button" class="cp-btn cp-btn-gray" @click="closeMultiScreenQrDialog">{{ $t('multiScreen.close') }}</button>
                            <button type="button" class="cp-btn cp-btn-primary" @click="copyMultiScreenEntryUrl">{{ $t('multiScreen.copyAddress') }}</button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>

    <!-- Connected WS Clients Dialog -->
    <Teleport to="body">
        <Transition name="cp-fade">
            <div v-if="showWsClientsDialog" class="cp-overlay cp-overlay--editor" @click.self="closeWsClientsDialog">
                <div class="cp-dialog cp-dialog--editor" v-glassmorphism="glassDropdownDirective" role="dialog" aria-modal="true" style="width:680px; max-width:95%;">
                    <div class="cp-header">
                        <div class="cp-header-left">
                            <div class="cp-icon">
                                <i class="fas fa-network-wired"></i>
                            </div>
                            <div class="cp-titles">
                                <div class="cp-title">已连接设备</div>
                                <div class="cp-subtitle">实时 WebSocket 客户端列表</div>
                            </div>
                        </div>
                        <button type="button" class="cp-close" @click="closeWsClientsDialog" aria-label="关闭">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="cp-content cp-content--scroll" style="max-height:58vh;">
                        <div v-if="wsClientsLoading" style="padding:24px 8px; text-align:center; color:var(--muted); font-size:13px;">
                            <i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i> 正在加载设备列表...
                        </div>

                        <div v-else-if="!wsClients || wsClients.length === 0" style="padding:24px 8px; text-align:center; color:var(--muted); font-size:13px;">
                            暂无已连接设备
                        </div>

                        <div v-else style="display:flex; flex-direction:column; gap:12px;">
                            <div
                                v-for="(client, index) in wsClients"
                                :key="(client.clientId || 'client') + '-' + index"
                                style="border:1px solid var(--divider); border-radius:10px; padding:12px; background:var(--input-bg);"
                            >
                                <div style="font-size:13px; color:var(--text); line-height:1.7; word-break:break-all;">
                                    <div><span style="color:var(--muted);">IP：</span>{{ client.ip || '-' }}</div>
                                    <div><span style="color:var(--muted);">ID：</span>{{ client.clientId || '-' }}</div>
                                    <div><span style="color:var(--muted);">延迟：</span>{{ formatWsClientLatency(client.latencyMs) }} ｜ <span style="color:var(--muted);">显示器：</span>{{ client.displayName || client.displayId || '未指定' }}</div>
                                    <div><span style="color:var(--muted);">客户端版本：</span>{{ client.clientVersion || '未上报' }} ｜ <span style="color:var(--muted);">系统：</span>{{ client.system || '未上报' }}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="cp-footer cp-footer--end">
                        <div class="cp-footer-right">
                            <button type="button" class="cp-btn cp-btn-gray" @click="closeWsClientsDialog">关闭</button>
                            <button type="button" class="cp-btn cp-btn-primary" @click="loadWsClients">刷新</button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>

    <!-- Release Notes Dialog（与 StationEditor：cp-overlay / cp-dialog + v-glassmorphism） -->
    <Teleport to="body">
        <Transition name="cp-fade">
            <div v-if="showReleaseNotes" class="cp-overlay cp-overlay--editor" @click.self="closeReleaseNotes">
                <div
                    class="cp-dialog cp-dialog--editor"
                    v-glassmorphism="{ blur: 12, opacity: 0.2, color: '#ffffff' }"
                    role="dialog"
                    aria-modal="true"
                    @mousedown.stop
                    @click.stop
                >
                    <div class="cp-header">
                        <div class="cp-header-left">
                            <div class="cp-icon">
                                <i class="fas fa-newspaper"></i>
                            </div>
                            <div class="cp-titles">
                                <div class="cp-title">{{ $t('about.releaseNotes.title') }}</div>
                                <div v-if="releaseNotesSourceText" class="cp-subtitle">{{ $t('about.releaseNotes.source', { source: releaseNotesSourceText }) }}</div>
                            </div>
                        </div>
                        <button type="button" class="cp-close" @click="closeReleaseNotes" aria-label="关闭">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="cp-content cp-content--scroll">
                        <!-- Loading State -->
                        <div v-if="loadingNotes" style="text-align:center; padding:60px 20px;">
                            <div style="display:inline-block; width:48px; height:48px; border:4px solid var(--divider, rgba(0,0,0,0.1)); border-top-color:var(--accent, #1677ff); border-radius:50%; animation:spin 1s linear infinite; margin-bottom:16px;"></div>
                            <div style="color:var(--muted, #999); font-size:14px;">{{ $t('about.releaseNotes.loading') }}</div>
                        </div>
                        
                        <!-- Empty State -->
                        <div v-else-if="releaseNotes.length === 0" style="text-align:center; padding:60px 20px;">
                            <div class="release-notes-empty-icon" style="width:80px; height:80px; margin:0 auto 20px; border-radius:50%; backdrop-filter:blur(24px) saturate(190%); -webkit-backdrop-filter:blur(24px) saturate(190%); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                                <i class="fas fa-inbox" style="font-size:32px; color:var(--muted, #999);"></i>
                            </div>
                            <div style="color:var(--muted, #999); font-size:14px; margin-bottom:8px;">{{ $t('about.releaseNotes.emptyTitle') }}</div>
                            <div style="color:var(--muted, #ccc); font-size:12px;">{{ $t('about.releaseNotes.emptySubtitle') }}</div>
                        </div>
                        
                        <!-- Release List -->
                        <div v-else style="display:flex; flex-direction:column; gap:20px;">
                            <div v-for="(release, index) in releaseNotes" 
                                 :key="index" 
                                 class="release-note-card"
                                 style="backdrop-filter:blur(24px) saturate(190%); -webkit-backdrop-filter:blur(24px) saturate(190%); border-radius:12px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.1); transition:all 0.2s;"
                                 @mouseover="$event.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.15)'; $event.currentTarget.style.transform='translateY(-2px)'"
                                 @mouseout="$event.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)'; $event.currentTarget.style.transform='translateY(0)'">
                                <!-- Release Header -->
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; gap:16px;">
                                    <div style="flex:1; min-width:0;">
                                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                                            <h3 style="margin:0; font-size:18px; font-weight:700; color:var(--text, #333); letter-spacing:-0.3px;">{{ release.name || release.tag_name }}</h3>
                                                                                        <span v-if="release.prerelease" 
                                                                                                    style="background:linear-gradient(135deg, #ffa502 0%, #ff6348 100%); color:white; padding:3px 10px; border-radius:6px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; box-shadow:0 2px 6px rgba(255,165,2,0.3);">
                                                                                                {{ $t('about.releaseNotes.preRelease') }}
                                            </span>
                                                                                        <span v-if="release.draft" 
                                                                                                    style="background:#95a5a6; color:white; padding:3px 10px; border-radius:6px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">
                                                                                                {{ $t('about.releaseNotes.draft') }}
                                            </span>
                                        </div>
                                        <div style="display:flex; align-items:center; gap:12px; font-size:12px; color:var(--muted, #999);">
                                            <div style="display:flex; align-items:center; gap:6px;">
                                                <i class="fas fa-calendar-alt" style="font-size:11px;"></i>
                                                <span>{{ new Date(release.published_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) }}</span>
                                            </div>
                                            <div style="width:4px; height:4px; border-radius:50%; background:var(--muted, #ccc);"></div>
                                            <div style="display:flex; align-items:center; gap:6px;">
                                                <i class="fas fa-tag" style="font-size:11px;"></i>
                                                <span>{{ release.tag_name }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Release Body -->
                                <div class="release-body-content" style="color:var(--text, #333); line-height:1.7; font-size:14px; padding-top:16px; border-top:1px solid var(--divider, rgba(0,0,0,0.08)); cursor:default;" @click="onReleaseBodyClick" v-html="formatReleaseBody(release.body, release)"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>

    <!-- 内置图片查看器 - 更新日志内图片点击放大 -->
    <Teleport to="body">
        <Transition name="fade">
            <div v-if="imageViewerSrc"
                 style="position:fixed; inset:0; z-index:25000; background:rgba(0,0,0,0.92); display:flex; align-items:center; justify-content:center; cursor:pointer;"
                 @click="closeImageViewer">
                <img :src="imageViewerSrc"
                     alt="查看大图"
                     style="max-width:95vw; max-height:95vh; object-fit:contain; border-radius:8px; pointer-events:none; box-shadow:0 8px 32px rgba(0,0,0,0.5);"
                     @click.stop>
                <button @click.stop="closeImageViewer"
                        style="position:absolute; top:20px; right:20px; width:44px; height:44px; border-radius:50%; border:none; background:rgba(255,255,255,0.2); color:white; cursor:pointer; font-size:20px; display:flex; align-items:center; justify-content:center; transition:background 0.2s;"
                        @mouseover="$event.currentTarget.style.background='rgba(255,255,255,0.35)'"
                        @mouseout="$event.currentTarget.style.background='rgba(255,255,255,0.2)'">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </Transition>
    </Teleport>

    <!-- 预设右键菜单 - 使用 Teleport 传送到 body，参照站点菜单的风格 -->
    <Teleport to="body">
        <div 
            v-if="presetContextMenu.visible"
            class="preset-context-menu"
            data-preset-context-menu
            @click.stop
            @contextmenu.prevent
            :style="{
                position: 'fixed',
                left: presetContextMenu.x + 'px',
                top: presetContextMenu.y + 'px'
            }"
        >
            <div class="preset-context-menu-item" @click="applyPresetFromMenu()">
                <i class="fas fa-download"></i>
                {{ $t('console.presetLoad') }}
            </div>
            <div class="preset-context-menu-divider"></div>
            <div class="preset-context-menu-item" @click="sharePresetOffline()">
                <i class="fas fa-share-alt"></i>
                {{ $t('console.presetShare') }}
            </div>
            <div class="preset-context-menu-divider"></div>
            <div class="preset-context-menu-item" @click="importPresetFromShareCode()">
                <i class="fas fa-file-import"></i>
                {{ $t('console.presetImport') }}
            </div>
            <div class="preset-context-menu-divider"></div>
            <div class="preset-context-menu-item danger" @click="deletePresetFromMenu()">
                <i class="fas fa-trash"></i>
                {{ $t('console.presetDelete') }}
            </div>
        </div>
    </Teleport>
    
    <!-- 点击外部关闭预设右键菜单的遮罩 - 使用 Teleport 传送到 body -->
    <Teleport to="body">
        <div 
            v-if="presetContextMenu.visible"
            @click="closePresetContextMenu"
            style="position: fixed; top:0; right:0; bottom:0; left:60px; z-index: 9998; background: transparent;"
        ></div>
    </Teleport>

    <!-- 显示端右键菜单 - 使用 Teleport 传送到 body -->
    <Teleport to="body">
        <div 
            v-if="displayContextMenu.visible"
            data-display-context-menu
            v-glassmorphism="{ blur: 24, opacity: 0.2, color: '#ffffff' }"
            @click.stop
            @contextmenu.prevent
            :style="{
                position: 'fixed',
                left: displayContextMenu.x + 'px',
                top: displayContextMenu.y + 'px',
                border: '1px solid ' + glassMenuBorder(),
                borderRadius: '12px',
                boxShadow: glassMenuShadow(),
                zIndex: 9999,
                minWidth: '140px',
                padding: '8px 0'
            }"
        >
            <div 
                @click="addNewDisplayFromMenu()"
                style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 10px; transition: background 0.2s; border-radius: 8px;"
                @mouseover="$event.target.style.background=glassItemHoverBackground(); $event.target.style.borderRadius='8px'"
                @mouseout="$event.target.style.background='transparent'; $event.target.style.borderRadius='8px'"
            >
                <i class="fas fa-plus" style="font-size: 12px; color: var(--muted, #666); width: 16px;"></i>
                新建
            </div>
            <div v-if="displayContextMenu.displayId" :style="{ height:'1px', background:glassDividerColor(), margin:'6px 4px' }"></div>
            <div 
                v-if="displayContextMenu.displayId"
                @click="editDisplayFromMenu()"
                style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 10px; transition: background 0.2s; border-radius: 8px;"
                @mouseover="$event.target.style.background=glassItemHoverBackground(); $event.target.style.borderRadius='8px'"
                @mouseout="$event.target.style.background='transparent'; $event.target.style.borderRadius='8px'"
            >
                <i class="fas fa-edit" style="font-size: 12px; color: var(--muted, #666); width: 16px;"></i>
                编辑
            </div>
            <div v-if="displayContextMenu.displayId" :style="{ height:'1px', background:glassDividerColor(), margin:'4px 0' }"></div>
            <div 
                v-if="displayContextMenu.displayId"
                @click="toggleDisplayEnabledFromMenu()"
                style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 10px; transition: background 0.2s; border-radius: 8px;"
                @mouseover="$event.target.style.background=glassItemHoverBackground(); $event.target.style.borderRadius='8px'"
                @mouseout="$event.target.style.background='transparent'; $event.target.style.borderRadius='8px'"
            >
                <i :class="displayContextMenu.displayId && displayState.displays[displayContextMenu.displayId] && isDisplayEnabled(displayState.displays[displayContextMenu.displayId]) ? 'fas fa-pause' : 'fas fa-play'" style="font-size: 12px; color: var(--muted, #666); width: 16px;"></i>
                {{ displayContextMenu.displayId && displayState.displays[displayContextMenu.displayId] && isDisplayEnabled(displayState.displays[displayContextMenu.displayId]) ? '禁用' : '启用' }}
            </div>
            <div v-if="displayContextMenu.displayId && displayState.displays[displayContextMenu.displayId] && displayContextMenu.displayId !== 'display-1' && displayContextMenu.displayId !== 'display-2' && displayContextMenu.displayId !== 'display-3' && !displayState.displays[displayContextMenu.displayId].isSystem" :style="{ height:'1px', background:glassDividerColor(), margin:'6px 4px' }"></div>
            <div 
                v-if="displayContextMenu.displayId && displayState.displays[displayContextMenu.displayId] && displayContextMenu.displayId !== 'display-1' && displayContextMenu.displayId !== 'display-2' && displayContextMenu.displayId !== 'display-3' && !displayState.displays[displayContextMenu.displayId].isSystem"
                @click="deleteDisplayFromMenu()"
                style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--btn-red-bg, #ff4444); display: flex; align-items: center; gap: 10px; transition: background 0.2s; border-radius: 8px;"
                @mouseover="$event.target.style.background='rgba(255, 68, 68, 0.12)'; $event.target.style.borderRadius='8px'"
                @mouseout="$event.target.style.background='transparent'; $event.target.style.borderRadius='8px'"
            >
                <i class="fas fa-trash" style="font-size: 12px; color: var(--btn-red-bg, #ff4444); width: 16px;"></i>
                删除
            </div>
        </div>
    </Teleport>
    
    <!-- 点击外部关闭显示端右键菜单的遮罩 - 使用 Teleport 传送到 body -->
    <Teleport to="body">
        <div 
            v-if="displayContextMenu.visible"
            @click="closeDisplayContextMenu"
            style="position: fixed; top:0; right:0; bottom:0; left:60px; z-index: 9998; background: transparent;"
        ></div>
    </Teleport>
    
    <component :is="'style'">
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .fade-enter-active, .fade-leave-active {
            transition: opacity 0.3s ease;
        }
        .fade-enter-from, .fade-leave-to {
            opacity: 0;
        }
        
        /* 更新日志列表卡片（外壳已改用 cp-dialog + cp-glass-modal-shell.css） */
        .release-note-card {
            background: rgba(255, 255, 255, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.4);
            backdrop-filter: blur(24px) saturate(190%);
            -webkit-backdrop-filter: blur(24px) saturate(190%);
        }
        @media (prefers-color-scheme: dark) {
            .release-note-card {
                background: rgba(50, 50, 50, 0.6);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
        }
        :global(.dark) .release-note-card,
        :global([data-theme="dark"]) .release-note-card {
            background: rgba(50, 50, 50, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .release-note-card:hover {
            background: rgba(255, 255, 255, 0.7) !important;
        }
        @media (prefers-color-scheme: dark) {
            .release-note-card:hover {
                background: rgba(60, 60, 60, 0.7) !important;
            }
        }
        :global(.dark) .release-note-card:hover,
        :global([data-theme="dark"]) .release-note-card:hover {
            background: rgba(60, 60, 60, 0.7) !important;
        }
        .release-note-img:hover { opacity: 0.9; }
        .release-note-img-wrap { cursor: pointer; }
        /* 空状态图标 */
        .release-notes-empty-icon {
            background: rgba(255, 255, 255, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.3);
        }
        @media (prefers-color-scheme: dark) {
            .release-notes-empty-icon {
                background: rgba(50, 50, 50, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
        }
        :global(.dark) .release-notes-empty-icon,
        :global([data-theme="dark"]) .release-notes-empty-icon {
            background: rgba(50, 50, 50, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        :global(html.blur-disabled) .release-note-card {
            background: #ffffff;
            border: 1px solid rgba(15, 23, 42, 0.12);
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
        }
        :global(html.blur-disabled) .release-note-card:hover {
            background: #f8f9fc !important;
        }
        :global(html.blur-disabled) .release-notes-empty-icon {
            background: #ffffff;
            border: 1px solid rgba(15, 23, 42, 0.12);
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
        }

        :global(html.blur-disabled.dark) .release-note-card,
        :global(html.blur-disabled[data-theme="dark"]) .release-note-card {
            background: #26262b;
            border: 1px solid rgba(255, 255, 255, 0.12);
        }
        :global(html.blur-disabled.dark) .release-note-card:hover,
        :global(html.blur-disabled[data-theme="dark"]) .release-note-card:hover {
            background: #2d2d33 !important;
        }
        :global(html.blur-disabled.dark) .release-notes-empty-icon,
        :global(html.blur-disabled[data-theme="dark"]) .release-notes-empty-icon {
            background: #26262b;
            border: 1px solid rgba(255, 255, 255, 0.12);
        }

        /* 设置页内框/进度条 - 与 PIDS 控制台一致（浅色/深色） */
        .settings-hint-box {
            background: rgba(255, 255, 255, 0.15);
        }
        @media (prefers-color-scheme: dark) {
            .settings-hint-box {
                background: rgba(255, 255, 255, 0.15);
            }
        }
        :global(html.dark) .settings-hint-box {
            background: rgba(255, 255, 255, 0.15);
        }
        .settings-progress-bg {
            background: rgba(0, 0, 0, 0.08);
        }
        @media (prefers-color-scheme: dark) {
            .settings-progress-bg {
                background: rgba(255, 255, 255, 0.12);
            }
        }
        :global(html.dark) .settings-progress-bg {
            background: rgba(255, 255, 255, 0.12);
        }
        </component>
  
</template>
<script src="./SlidePanel.js"></script>
