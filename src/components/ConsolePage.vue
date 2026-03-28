<template>
    <div id="console-page" class="pids-ant-page pids-console-ant" style="flex:1; display:flex; flex-direction:column; overflow:auto; background:var(--bg); padding:24px 16px;">
      <a-space direction="vertical" :size="16" style="width:100%">
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between;">
          <div style="text-align:left;">
              <a-typography-title :level="4" style="margin:0; color:var(--text); letter-spacing:1px;">{{ t('console.title') }}</a-typography-title>
              <a-typography-text type="secondary" style="font-size:12px; font-weight:600;">{{ t('console.versionTag') }}</a-typography-text>
          </div>
      </div>
      
      <!-- Content -->
      <div style="width:100%;">
          <!-- Folder & Line Management -->
          <a-card variant="borderless" class="pids-ant-card pids-ant-card--orange">
          <div class="pids-ant-card-title pids-ant-card-title--orange">{{ t('console.lineManager') }}</div>
          
          <a-alert type="info" show-icon style="margin-bottom:12px;">
            <template #message>{{ t('console.currentLine') }}</template>
            <template #description>
              <a-typography-text strong style="font-size:16px;">{{ pidsState.appData?.meta?.lineName || '未选择' }}</a-typography-text>
            </template>
          </a-alert>
          
          <a-row :gutter="[12,12]">
            <a-col :xs="24" :sm="12">
              <a-button type="primary" block class="pids-console-line-btn pids-console-line-btn--manager" @click="openLineManagerWindow()">
                <i class="fas fa-folder-open"></i>{{ t('console.openManager') }}
              </a-button>
            </a-col>
            <a-col :xs="24" :sm="12">
              <a-button block class="pids-console-line-btn pids-console-line-btn--save" @click="openLineManagerForSave('line')">
                <i class="fas fa-save"></i>{{ t('console.saveCurrentLine') }}
              </a-button>
            </a-col>
          </a-row>
          </a-card>
          
        <!-- Service Mode Settings -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--red">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                <div class="pids-ant-card-title pids-ant-card-title--red" style="margin-bottom:0;">{{ t('console.serviceMode') }}</div>
                <a-space align="center" :size="10" wrap>
                    <a-typography-text type="secondary" style="font-size:14px; font-weight:600;">{{ t('console.currentMode') }}</a-typography-text>
                    <a-tag v-if="pidsState.appData.meta.serviceMode==='express'" color="orange" style="font-size:15px; padding:6px 14px; line-height:1.45; margin:0;">{{ t('console.modeExpress') }}</a-tag>
                    <a-tag v-else-if="pidsState.appData.meta.serviceMode==='direct'" color="red" style="font-size:15px; padding:6px 14px; line-height:1.45; margin:0;">{{ t('console.modeDirect') }}</a-tag>
                    <a-tag v-else color="blue" style="font-size:15px; padding:6px 14px; line-height:1.45; margin:0;">{{ t('console.modeNormal') }}</a-tag>
                </a-space>
            </div>
            
            <a-input v-model:value="pidsState.appData.meta.lineName" placeholder="线路名称" style="width:100%; margin-bottom:12px;" @change="saveCfg()" />
            
            <a-space direction="vertical" :size="12" style="width:100%; margin-bottom:12px;">
              <a-space wrap :size="[10,10]" align="center" style="width:100%;">
                <div style="position:relative; width:60px; height:42px; flex-shrink:0;">
                    <input 
                        v-if="!hasElectronAPI"
                        type="color" 
                        v-model="pidsState.appData.meta.themeColor" 
                        style="position:absolute; top:0; left:0; width:100%; height:100%; padding:0; margin:0; border:none; border-radius:6px; cursor:pointer; opacity:0; z-index:2;" 
                        title="主题色" 
                        @input="saveCfgAndPersistSilent()"
                    >
                    <div 
                        :style="{position:'absolute', top:0, left:0, width:'100%', height:'100%', borderRadius:'6px', border:'2px solid var(--divider)', backgroundColor:pidsState.appData.meta.themeColor || '#00b894', pointerEvents:hasElectronAPI ? 'auto' : 'none', zIndex:1, cursor:'pointer'}"
                        title="主题色"
                        @click="pickColor"
                    ></div>
                </div>
                <div class="pids-console-line-mode-btns">
                  <a-button
                    class="pids-console-line-mode-btn"
                    :type="pidsState.appData.meta.mode === 'loop' ? 'primary' : 'default'"
                    @click="setLineMode('loop')"
                  >
                    {{ t('console.loopLine') }}
                  </a-button>
                  <a-button
                    class="pids-console-line-mode-btn"
                    :type="pidsState.appData.meta.mode === 'linear' ? 'primary' : 'default'"
                    @click="setLineMode('linear')"
                  >
                    {{ t('console.singleLine') }}
                  </a-button>
                </div>
              </a-space>

              <a-radio-group
                v-if="pidsState.appData.meta.mode === 'loop'"
                v-model:value="pidsState.appData.meta.dirType"
                option-type="button"
                button-style="solid"
                class="pids-console-radio-wrap"
                @change="saveCfg()"
              >
                <a-radio-button value="outer">{{ t('console.outerLoop') }}</a-radio-button>
                <a-radio-button value="inner">{{ t('console.innerLoop') }}</a-radio-button>
              </a-radio-group>
              <a-radio-group
                v-else
                v-model:value="pidsState.appData.meta.dirType"
                option-type="button"
                button-style="solid"
                class="pids-console-radio-wrap pids-console-radio-wrap--updown-row"
                @change="saveCfg()"
              >
                <a-radio-button value="up">{{ t('console.dirLabel') }} ({{ pidsState.appData.stations[0]?.name }} → {{ pidsState.appData.stations[pidsState.appData.stations.length-1]?.name }})</a-radio-button>
                <a-radio-button value="down">{{ t('console.dirLabelDown') || t('console.dirLabel') }} ({{ pidsState.appData.stations[pidsState.appData.stations.length-1]?.name }} → {{ pidsState.appData.stations[0]?.name }})</a-radio-button>
              </a-radio-group>
            </a-space>

            <a-divider style="margin:12px 0;" />
            <a-typography-text type="secondary" strong style="display:block; margin-bottom:8px;">{{ t('console.serviceMode') }}</a-typography-text>
            <a-radio-group
              :value="pidsState.appData.meta.serviceMode"
              option-type="button"
              button-style="solid"
              class="pids-console-radio-wrap pids-console-radio-wrap--service-row"
              @update:value="changeServiceMode"
            >
              <a-radio-button value="normal">{{ t('console.modeNormal') }}</a-radio-button>
              <a-radio-button value="express">{{ t('console.modeExpress') }}</a-radio-button>
              <a-radio-button value="direct">{{ t('console.modeDirect') }}</a-radio-button>
            </a-radio-group>
            <a-typography-text type="secondary" style="font-size:12px; display:block; margin-top:8px; line-height:1.6;">
              {{ t('console.modeHint') }}
            </a-typography-text>
        </a-card>
        
        <!-- Short Turn Settings -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--purple">
            <div class="pids-ant-card-title pids-ant-card-title--purple">{{ t('console.shortTurn') }}</div>
            <div style="display:grid; grid-template-columns: 72px minmax(0, 1fr); gap:12px; align-items:center; margin-bottom:12px;">
                <label style="color:var(--muted);">{{ t('console.shortTurnStart') }}</label>
                <div ref="shortTurnStartDropdownRef" style="position:relative; min-width:0;">
                    <div
                        @click="toggleShortTurnStartDropdown"
                        :style="shortTurnDropdownTriggerStyle"
                    >
                        <span style="font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ shortTurnStartTitle }}</span>
                        <i :class="showShortTurnStartDropdown ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:12px; color:var(--muted);"></i>
                    </div>
                    <div v-if="showShortTurnStartDropdown" v-glassmorphism="glassDropdownDirective" :style="shortTurnStartDropdownMenuStyle">
                        <div @click="selectShortTurnStart(-1)" :style="{ padding:'8px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'13px', color:'var(--text)', background: pidsState.appData.meta.startIdx === -1 ? shortTurnItemActiveBackground() : 'transparent' }" @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()" @mouseout="$event.currentTarget.style.background = (pidsState.appData.meta.startIdx === -1 ? shortTurnItemActiveBackground() : 'transparent')">无</div>
                        <div v-for="(s,i) in pidsState.appData.stations" :key="'s'+i" @click="selectShortTurnStart(i)" :style="{ padding:'8px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'13px', color:'var(--text)', background: pidsState.appData.meta.startIdx === i ? shortTurnItemActiveBackground() : 'transparent' }" @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()" @mouseout="$event.currentTarget.style.background = (pidsState.appData.meta.startIdx === i ? shortTurnItemActiveBackground() : 'transparent')">[{{i+1}}] {{s.name}}</div>
                    </div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 72px minmax(0, 1fr); gap:12px; align-items:center; margin-bottom:16px;">
                <label style="color:var(--muted);">{{ t('console.shortTurnEnd') }}</label>
                <div ref="shortTurnEndDropdownRef" style="position:relative; min-width:0;">
                    <div
                        @click="toggleShortTurnEndDropdown"
                        :style="shortTurnDropdownTriggerStyle"
                    >
                        <span style="font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ shortTurnEndTitle }}</span>
                        <i :class="showShortTurnEndDropdown ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:12px; color:var(--muted);"></i>
                    </div>
                    <div v-if="showShortTurnEndDropdown" v-glassmorphism="glassDropdownDirective" :style="shortTurnEndDropdownMenuStyle">
                        <div @click="selectShortTurnEnd(-1)" :style="{ padding:'8px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'13px', color:'var(--text)', background: pidsState.appData.meta.termIdx === -1 ? shortTurnItemActiveBackground() : 'transparent' }" @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()" @mouseout="$event.currentTarget.style.background = (pidsState.appData.meta.termIdx === -1 ? shortTurnItemActiveBackground() : 'transparent')">无</div>
                        <div v-for="(s,i) in pidsState.appData.stations" :key="'e'+i" @click="selectShortTurnEnd(i)" :style="{ padding:'8px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'13px', color:'var(--text)', background: pidsState.appData.meta.termIdx === i ? shortTurnItemActiveBackground() : 'transparent' }" @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()" @mouseout="$event.currentTarget.style.background = (pidsState.appData.meta.termIdx === i ? shortTurnItemActiveBackground() : 'transparent')">[{{i+1}}] {{s.name}}</div>
                    </div>
                </div>
            </div>

            <a-space style="width:100%; justify-content:flex-end; margin-bottom:16px;" wrap>
                <a-button @click="clearShortTurn()">{{ t('console.shortTurnClear') }}</a-button>
                <a-button type="primary" style="background:#5F27CD; border-color:#5F27CD;" @click="applyShortTurn()">{{ t('console.shortTurnApply') }}</a-button>
            </a-space>

            <!-- 短交路预设管理 -->
            <a-typography-text type="secondary" strong style="display:block; margin-bottom:12px;">{{ t('console.shortTurnPreset') }}</a-typography-text>
            <a-row :gutter="[8,8]" style="margin-bottom:12px;">
              <a-col :span="24" :md="12">
                <a-button type="primary" block size="middle" class="pids-console-compact-btn" style="background:#5F27CD; border-color:#5F27CD;" @click="saveShortTurnPreset()">
                  <i class="fas fa-save"></i>{{ t('console.shortTurnSavePreset') }}
                </a-button>
              </a-col>
              <a-col :span="24" :md="12">
                <a-button block size="middle" class="pids-console-compact-btn" style="background:#00D2D3; border-color:#00D2D3; color:#fff;" @click="loadShortTurnPresets()">
                  <i class="fas fa-sync-alt"></i>{{ t('console.shortTurnRefresh') }}
                </a-button>
              </a-col>
            </a-row>
            <div 
                v-if="shortTurnPresets.length > 0" 
                style="max-height:200px; overflow-y:auto; border:1px solid var(--divider); border-radius:6px; padding:8px; margin-bottom:12px;"
                @contextmenu.prevent="showPresetContextMenu($event, null)"
            >
                <div v-for="preset in shortTurnPresets" :key="preset.name" @contextmenu.prevent="showPresetContextMenu($event, preset)" style="display:flex; align-items:center; justify-content:space-between; padding:8px; margin-bottom:4px; background:var(--input-bg); border-radius:4px; cursor:pointer;" @click="loadShortTurnPreset(preset.name)">
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; font-weight:bold; color:var(--text); margin-bottom:2px;">{{ preset.name }}</div>
                        <div style="font-size:11px; color:var(--muted);">
                            {{ preset.startStationName || ('站点' + (preset.startIdx + 1)) }} → {{ preset.termStationName || ('站点' + (preset.termIdx + 1)) }}
                        </div>
                    </div>
                </div>
            </div>
            <div 
                v-else 
                style="padding:12px; text-align:center; color:var(--muted); font-size:12px; border:1px dashed var(--divider); border-radius:6px; margin-bottom:12px; cursor:context-menu;"
                @contextmenu.prevent="showPresetContextMenu($event, null)"
            >
                <!-- 可根据需要新增 i18n 文案 -->
                暂无预设，点击"保存预设"保存当前短交路设置（右键此处可从分享码导入）
            </div>
        </a-card>

        <!-- Through Line Settings -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--violet pids-console-through-outer">
            <div class="pids-ant-card-title pids-ant-card-title--violet">{{ t('console.throughTitle') }}</div>
            
            <div class="pids-console-through-box" style="background:var(--input-bg); border:1px solid var(--divider);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px;">
                    <div style="font-size:13px; font-weight:600; color:var(--text);">{{ t('console.throughSegments') }}</div>
                    <a-button type="primary" class="pids-console-through-btn" style="background:#2ED573; border-color:#2ED573;" @click="addThroughLineSegment()">
                        <i class="fas fa-plus"></i>{{ t('console.throughAdd') }}
                    </a-button>
                </div>
                
                <div v-if="throughLineSegments.length === 0" style="padding:8px; text-align:center; color:var(--muted); font-size:12px; border:1px dashed var(--divider); border-radius:4px; margin-bottom:0;">
                    {{ t('console.throughNoSegments') }}
                </div>
                
                <div v-for="(segment, index) in throughLineSegments" :key="index" style="margin-bottom:8px; padding:8px; background:var(--bg); border:1px solid var(--divider); border-radius:6px;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap;">
                        <div style="min-width:52px; font-size:12px; font-weight:600; color:var(--text);">
                            {{ t('console.throughLineLabel') + String.fromCharCode('A'.charCodeAt(0) + index) }}
                        </div>
                        <div style="flex:1; min-width:120px; padding:4px 8px; border-radius:4px; border:1px solid var(--divider); background:var(--input-bg); color:var(--text); font-size:12px; min-height:26px; display:flex; align-items:center;">
                            {{ segment.lineName || t('console.throughNotSelected') }}
                        </div>
                        <a-button type="primary" class="pids-console-through-btn" style="background:#9B59B6; border-color:#9B59B6; white-space:nowrap;" @click="openLineManagerForSegment(index)">
                            <i class="fas fa-folder-open"></i>{{ t('console.throughSelect') }}
                        </a-button>
                        <a-button v-if="throughLineSegments.length > 2" danger size="small" class="pids-console-through-btn" @click="removeThroughLineSegment(index)">
                            <i class="fas fa-trash"></i>
                        </a-button>
                    </div>
                    <div v-if="index < throughLineSegments.length - 1" style="display:grid; grid-template-columns: 52px 1fr; gap:6px; align-items:center; margin-top:6px;">
                            <label :style="throughStationLabelStyle">{{ t('console.throughStation') }}</label>
                        <div v-if="segment.candidateThroughStations && segment.candidateThroughStations.length > 1" class="through-station-dropdown" style="position:relative;">
                            <div
                                @click="toggleThroughStationDropdown(index)"
                                :style="[{ ...throughStationControlStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }]"
                            >
                                <span>{{ segment.throughStationName || '请选择贯通站点' }}</span>
                                <i :class="throughStationDropdownIndex === index ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:11px; color:var(--muted);"></i>
                            </div>
                            <div v-if="throughStationDropdownIndex === index" v-glassmorphism="glassDropdownDirective" :style="throughStationDropdownMenuStyle">
                                <div
                                    @click="selectThroughStation(index, '')"
                                    :style="{
                                        padding: '9px 10px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        color: 'var(--text)',
                                        fontSize: '13px',
                                        fontWeight: !segment.throughStationName ? '700' : '500',
                                        background: !segment.throughStationName ? shortTurnItemActiveBackground() : 'transparent'
                                    }"
                                    @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                    @mouseout="$event.currentTarget.style.background = (!segment.throughStationName ? shortTurnItemActiveBackground() : 'transparent')"
                                >
                                    请选择贯通站点
                                </div>
                                <div
                                    v-for="stationName in segment.candidateThroughStations"
                                    :key="stationName"
                                    @click="selectThroughStation(index, stationName)"
                                    :style="{
                                        padding: '9px 10px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        color: 'var(--text)',
                                        fontSize: '13px',
                                        fontWeight: segment.throughStationName === stationName ? '700' : '500',
                                        background: segment.throughStationName === stationName ? shortTurnItemActiveBackground() : 'transparent'
                                    }"
                                    @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                    @mouseout="$event.currentTarget.style.background = (segment.throughStationName === stationName ? shortTurnItemActiveBackground() : 'transparent')"
                                >
                                    {{ stationName }}
                                </div>
                            </div>
                        </div>
                        <div v-else :style="[{ ...throughStationControlStyle, display: 'flex', alignItems: 'center' }]">
                            {{ segment.throughStationName || t('console.throughNotDetected') }}
                        </div>
                    </div>
                </div>
            </div>

            <a-space style="width:100%; justify-content:flex-end;" :size="8">
                <a-button class="pids-console-through-footer" @click="clearThroughOperation()">{{ t('console.shortTurnClear') }}</a-button>
                <a-button type="primary" class="pids-console-through-footer" style="background:#9B59B6; border-color:#9B59B6;" @click="applyThroughOperation()">{{ t('console.shortTurnApply') }}</a-button>
            </a-space>
        </a-card>
        
        <!-- Autoplay Control -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--blue">
          <div class="pids-ant-card-title pids-ant-card-title--blue">{{ t('console.autoplayTitle') }}</div>
          
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
              <a-typography-text>{{ t('console.autoplayEnable') }}</a-typography-text>
              <a-switch
                :checked="isPlaying"
                @change="(checked) => checked ? startWithLock(settings.autoplay.intervalSec) : stopWithUnlock()"
              />
          </div>
          
          <a-space align="center" wrap>
              <a-typography-text type="secondary">{{ t('console.autoplayInterval') }}</a-typography-text>
              <a-input-number v-model:value="settings.autoplay.intervalSec" :min="1" :max="3600" style="width:100px;" @change="applyAutoplayIntervalSec()" />
              <a-typography-text v-if="isPlaying" type="secondary" style="font-size:12px;">({{ nextIn }}s)</a-typography-text>
          </a-space>
        </a-card>
        
        <!-- Video Recording Control -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--recording">
          <div class="pids-ant-card-title pids-ant-card-title--recording">{{ t('console.recordingTitle') }}</div>
          
          <!-- Display Info (use settings page selection) -->
          <a-form-item :label="t('console.recordingDisplay')" style="margin-bottom:12px;">
            <a-input :value="currentRecordingDisplay ? currentRecordingDisplay.name : ''" :placeholder="t('console.recordingSelectDisplay')" readonly />
          </a-form-item>

          <!-- Encoder Selection -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
            <div>
              <a-form-item :label="t('console.recordingEncoder')" style="margin-bottom:0;">
                            <div class="recording-dropdown" style="position:relative;">
                                <div
                                    @click="toggleRecordingDropdown('encoder')"
                                    :style="[{ ...recordingSelectStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor: recordingState.isRecording ? 'not-allowed' : 'pointer', opacity: recordingState.isRecording ? 0.7 : 1 }]"
                                >
                                    <span>{{ getRecordingOptionLabel(recordingEncoderOptions, recordingState.encoder) }}</span>
                                    <i :class="recordingDropdownOpenKey === 'encoder' ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:11px; color:var(--muted);"></i>
                                </div>
                                <div v-if="recordingDropdownOpenKey === 'encoder'" v-glassmorphism="glassDropdownDirective" :style="recordingDropdownMenuStyle">
                                    <div
                                        v-for="opt in recordingEncoderOptions"
                                        :key="'encoder-' + opt.value"
                                        @click="selectRecordingDropdownValue('encoder', opt.value)"
                                        :style="{
                                            padding: '9px 10px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            color: 'var(--text)',
                                            fontSize: '13px',
                                            fontWeight: recordingState.encoder === opt.value ? '700' : '500',
                                            background: recordingState.encoder === opt.value ? shortTurnItemActiveBackground() : 'transparent'
                                        }"
                                        @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                        @mouseout="$event.currentTarget.style.background = (recordingState.encoder === opt.value ? shortTurnItemActiveBackground() : 'transparent')"
                                    >
                                        {{ opt.label }}
                                    </div>
                                </div>
                            </div>
              </a-form-item>
            </div>
            <div>
              <a-form-item :label="t('console.recordingCodec')" style="margin-bottom:0;">
                            <div class="recording-dropdown" style="position:relative;">
                                <div
                                    @click="toggleRecordingDropdown('codec')"
                                    :style="[{ ...recordingSelectStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor: recordingState.isRecording ? 'not-allowed' : 'pointer', opacity: recordingState.isRecording ? 0.7 : 1 }]"
                                >
                                    <span>{{ getRecordingOptionLabel(recordingCodecOptions, recordingState.codec) }}</span>
                                    <i :class="recordingDropdownOpenKey === 'codec' ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:11px; color:var(--muted);"></i>
                                </div>
                                <div v-if="recordingDropdownOpenKey === 'codec'" v-glassmorphism="glassDropdownDirective" :style="recordingDropdownMenuStyle">
                                    <div
                                        v-for="opt in recordingCodecOptions"
                                        :key="'codec-' + opt.value"
                                        @click="selectRecordingDropdownValue('codec', opt.value)"
                                        :style="{
                                            padding: '9px 10px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            color: 'var(--text)',
                                            fontSize: '13px',
                                            fontWeight: recordingState.codec === opt.value ? '700' : '500',
                                            background: recordingState.codec === opt.value ? shortTurnItemActiveBackground() : 'transparent'
                                        }"
                                        @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                        @mouseout="$event.currentTarget.style.background = (recordingState.codec === opt.value ? shortTurnItemActiveBackground() : 'transparent')"
                                    >
                                        {{ opt.label }}
                                    </div>
                                </div>
                            </div>
              </a-form-item>
            </div>
          </div>

          <!-- Container Selection -->
          <div style="margin-bottom:12px;">
            <a-form-item :label="t('console.recordingContainer')" style="margin-bottom:0;">
                        <div class="recording-dropdown" style="position:relative;">
                            <div
                                @click="toggleRecordingDropdown('container')"
                                :style="[{ ...recordingSelectStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor: recordingState.isRecording ? 'not-allowed' : 'pointer', opacity: recordingState.isRecording ? 0.7 : 1 }]"
                            >
                                <span>{{ getRecordingOptionLabel(recordingContainerOptions, recordingState.container) }}</span>
                                <i :class="recordingDropdownOpenKey === 'container' ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:11px; color:var(--muted);"></i>
                            </div>
                            <div v-if="recordingDropdownOpenKey === 'container'" v-glassmorphism="glassDropdownDirective" :style="recordingDropdownMenuStyle">
                                <div
                                    v-for="opt in recordingContainerOptions"
                                    :key="'container-' + opt.value"
                                    @click="selectRecordingDropdownValue('container', opt.value)"
                                    :style="{
                                        padding: '9px 10px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        color: 'var(--text)',
                                        fontSize: '13px',
                                        fontWeight: recordingState.container === opt.value ? '700' : '500',
                                        background: recordingState.container === opt.value ? shortTurnItemActiveBackground() : 'transparent'
                                    }"
                                    @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                    @mouseout="$event.currentTarget.style.background = (recordingState.container === opt.value ? shortTurnItemActiveBackground() : 'transparent')"
                                >
                                    {{ opt.label }}
                                </div>
                            </div>
                        </div>
            </a-form-item>
          </div>

          <!-- Bitrate and FPS -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
            <div>
              <a-form-item :label="t('console.recordingBitrate')" style="margin-bottom:0;">
                <a-space>
                  <a-input-number
                    v-model:value="recordingState.bitrate"
                    :disabled="recordingState.isRecording"
                    :min="1"
                    :max="50"
                    :step="1"
                    style="width:100%; min-width:120px;"
                  />
                  <a-typography-text type="secondary">Mbps</a-typography-text>
                </a-space>
              </a-form-item>
            </div>
            <div>
              <a-form-item :label="t('console.recordingFPS')" style="margin-bottom:0;">
                            <div class="recording-dropdown" style="position:relative;">
                                <div
                                    @click="toggleRecordingDropdown('fps')"
                                    :style="[{ ...recordingSelectStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor: recordingState.isRecording ? 'not-allowed' : 'pointer', opacity: recordingState.isRecording ? 0.7 : 1 }]"
                                >
                                    <span>{{ getRecordingOptionLabel(recordingFpsOptions, recordingState.fps) }}</span>
                                    <i :class="recordingDropdownOpenKey === 'fps' ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:11px; color:var(--muted);"></i>
                                </div>
                                <div v-if="recordingDropdownOpenKey === 'fps'" v-glassmorphism="glassDropdownDirective" :style="recordingDropdownMenuStyle">
                                    <div
                                        v-for="opt in recordingFpsOptions"
                                        :key="'fps-' + opt.value"
                                        @click="selectRecordingDropdownValue('fps', opt.value)"
                                        :style="{
                                            padding: '9px 10px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            color: 'var(--text)',
                                            fontSize: '13px',
                                            fontWeight: Number(recordingState.fps) === Number(opt.value) ? '700' : '500',
                                            background: Number(recordingState.fps) === Number(opt.value) ? shortTurnItemActiveBackground() : 'transparent'
                                        }"
                                        @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                        @mouseout="$event.currentTarget.style.background = (Number(recordingState.fps) === Number(opt.value) ? shortTurnItemActiveBackground() : 'transparent')"
                                    >
                                        {{ opt.label }}
                                    </div>
                                </div>
                            </div>
              </a-form-item>
            </div>
          </div>

          <!-- Interval (like autoplay) -->
          <a-form-item :label="t('console.recordingIntervalLabel')" style="margin-bottom:12px;">
            <a-input-number
              v-model:value="recordingState.intervalSec"
              :disabled="recordingState.isRecording"
              :min="1"
              :max="60"
              :step="1"
              style="width:100%; max-width:200px;"
            />
          </a-form-item>

          <!-- Parallel Segment Recording -->
          <div style="margin-bottom:12px; padding:10px; border-radius:10px; border:1px solid var(--divider); background:var(--input-bg);">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px;">
              <a-typography-text type="secondary" strong>{{ t('console.recordingParallelTitle') }}</a-typography-text>
              <a-switch
                :checked="recordingState.parallelEnabled"
                :disabled="recordingState.isRecording"
                @change="(v) => { recordingState.parallelEnabled = v }"
              />
            </div>
            <div v-if="recordingState.parallelEnabled" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div>
                <a-form-item :label="t('console.recordingParallelism')" style="margin-bottom:0;">
                                <div class="recording-dropdown" style="position:relative;">
                                    <div
                                        @click="toggleRecordingDropdown('parallelism')"
                                        :style="[{ ...recordingSelectStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor: recordingState.isRecording ? 'not-allowed' : 'pointer', opacity: recordingState.isRecording ? 0.7 : 1 }]"
                                    >
                                        <span>{{ getRecordingOptionLabel(recordingParallelismOptions, recordingState.parallelism) }}</span>
                                        <i :class="recordingDropdownOpenKey === 'parallelism' ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:11px; color:var(--muted);"></i>
                                    </div>
                                    <div v-if="recordingDropdownOpenKey === 'parallelism'" v-glassmorphism="glassDropdownDirective" :style="recordingDropdownMenuStyle">
                                        <div
                                            v-for="opt in recordingParallelismOptions"
                                            :key="'parallelism-' + opt.value"
                                            @click="selectRecordingDropdownValue('parallelism', opt.value)"
                                            :style="{
                                                padding: '9px 10px',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                color: 'var(--text)',
                                                fontSize: '13px',
                                                fontWeight: Number(recordingState.parallelism) === Number(opt.value) ? '700' : '500',
                                                background: Number(recordingState.parallelism) === Number(opt.value) ? shortTurnItemActiveBackground() : 'transparent'
                                            }"
                                            @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                            @mouseout="$event.currentTarget.style.background = (Number(recordingState.parallelism) === Number(opt.value) ? shortTurnItemActiveBackground() : 'transparent')"
                                        >
                                            {{ opt.label }}
                                        </div>
                                    </div>
                                </div>
                </a-form-item>
              </div>
              <div>
                <a-form-item :label="t('console.recordingStepsPerSegment')" style="margin-bottom:0;">
                  <a-input-number v-model:value="recordingState.stepsPerSegment" :disabled="recordingState.isRecording" :min="1" :max="5000" style="width:100%" />
                </a-form-item>
              </div>
            </div>
            <div v-if="recordingState.parallelEnabled" style="margin-top:8px; font-size:12px; color:var(--muted);">
              {{ t('console.recordingParallelHint') }}
            </div>
          </div>

          <!-- Progress Bar（整体录制进度 + 预计剩余时间 + 当前站/进出站状态） -->
          <div v-if="recordingState.isRecording" style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:8px;">
              <a-typography-text type="secondary">{{ t('console.recordingProgress') }}</a-typography-text>
              <a-typography-text>
                {{ Math.floor(recordingProgressPercent) }}%
                <span style="margin-left:8px;">
                  {{ t('console.recordingRemainingTimeHint') }} {{ recordingRemainingTimeText }}
                </span>
              </a-typography-text>
            </div>
            <a-progress
              :percent="Math.min(100, Math.max(0, Math.floor(recordingProgressPercent)))"
              :show-info="false"
              stroke-color="#E74C3C"
              :stroke-width="8"
            />
            <div v-if="recordingState.mode!=='parallel'" style="margin-top:6px; display:flex; justify-content:space-between; font-size:12px; color:var(--muted);">
              <span>
                {{ t('console.recordingCurrentStation') }}：{{ recordingCurrentStationName }}
              </span>
              <span>
                {{ recordingArrDepLabel }}
              </span>
            </div>
            <div v-if="recordingState.mode==='parallel' && recordingState.segmentSummary" style="margin-top:6px; font-size:12px; color:var(--muted); display:flex; justify-content:space-between;">
              <span>{{ t('console.recordingSegments') }}: {{ recordingState.segmentSummary.done }}/{{ recordingState.segmentSummary.total }}</span>
              <span v-if="parallelStageLabel">{{ t('console.recordingStage') }}: {{ parallelStageLabel }}</span>
            </div>
          </div>

          <!-- Control Buttons -->
          <a-row :gutter="[10,10]">
            <a-col :span="24" :sm="12">
              <a-button
                danger
                block
                size="large"
                :disabled="!currentRecordingDisplay"
                @click="toggleRecording"
              >
                <i :class="recordingState.isRecording ? 'fas fa-stop' : 'fas fa-video'" style="margin-right:6px;"></i>
                {{ recordingState.isRecording ? t('console.recordingStop') : t('console.recordingStart') }}
              </a-button>
            </a-col>
            <a-col :span="24" :sm="12">
              <a-button block size="large" @click="openRecordingFolder">
                <i class="fas fa-folder-open" style="margin-right:6px;"></i>{{ t('console.recordingOpenFolder') }}
              </a-button>
            </a-col>
          </a-row>
        </a-card>
        
      </div>
      </a-space>
    </div>
    
    <!-- 预设右键菜单 - 使用 Teleport 传送到 body，复用站点右键菜单的视觉风格 -->
    <Teleport to="body">
        <div 
            v-if="presetContextMenu.visible"
            class="station-context-menu"
            data-preset-context-menu
            @click.stop
            @contextmenu.prevent
            :style="{
                position: 'fixed',
                left: presetContextMenu.x + 'px',
                top: presetContextMenu.y + 'px',
                zIndex: 9999
            }"
        >
            <!-- 有选中预设时的菜单 -->
            <template v-if="presetContextMenu.preset">
                <div class="station-context-menu-item" @click="applyPresetFromMenu()">
                    <i class="fas fa-download"></i>
                    {{ t('console.presetLoad') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item" @click="sharePresetOffline()">
                    <i class="fas fa-share-alt"></i>
                    {{ t('console.presetShare') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item" @click="importPresetFromShareCode()">
                    <i class="fas fa-file-import"></i>
                    {{ t('console.presetImport') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item danger" @click="deletePresetFromMenu()">
                    <i class="fas fa-trash"></i>
                    {{ t('console.presetDelete') }}
                </div>
            </template>
            <!-- 没有预设时，仅提供从分享码导入 -->
            <template v-else>
                <div class="station-context-menu-item" @click="importPresetFromShareCode()">
                    <i class="fas fa-file-import"></i>
                    {{ t('console.presetImport') }}
                </div>
            </template>
        </div>
    </Teleport>
    
    <!-- 点击外部关闭预设右键菜单的遮罩 - 使用 Teleport 传送到 body -->
    <Teleport to="body">
        <div 
            v-if="presetContextMenu.visible"
            @click="closePresetContextMenu"
            style="position: fixed; inset: 0; z-index: 9998; background: transparent;"
        ></div>
    </Teleport>
    
    <!-- Color Picker Dialog -->
    <ColorPicker 
      v-model="showColorPicker" 
      :initial-color="colorPickerInitialColor"
      @confirm="onColorConfirm"
    />
</template>
<script src="./ConsolePage.js"></script>
