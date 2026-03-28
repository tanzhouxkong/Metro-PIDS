<template>

    <a-config-provider :locale="antdLocale" :theme="antdThemeConfig">
    <div class="root" style="
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      background: transparent;
        position: relative;
      z-index: 1;
      ">
      <!-- Main Content Area (顶部栏+侧边栏已通过 BrowserView 嵌入，主内容区需要透明背景以透到桌面) -->
      <div id="admin-app" style="display:flex; overflow:hidden; position: absolute; top: 32px; left: 60px; right: 16px; bottom: 16px; z-index: 10; pointer-events: auto; border-radius: 12px;">
            <!-- Show different pages based on activePanel - 使用 v-show 避免组件卸载/挂载导致的闪烁 -->
            <div v-show="uiState.activePanel === 'panel-1'" style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:absolute; top:0; left:0; right:0; bottom:0;">
              <ConsolePage />
            </div>
            <div v-show="uiState.activePanel === 'panel-4'" style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:absolute; top:0; left:0; right:0; bottom:0;">
              <SettingsPage />
            </div>
            <div v-show="uiState.activePanel && uiState.activePanel !== 'panel-1' && uiState.activePanel !== 'panel-4'" style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:absolute; top:0; left:0; right:0; bottom:0;">
              <SlidePanel />
            </div>
            <div v-show="!uiState.activePanel" style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:absolute; top:0; left:0; right:0; bottom:0;">
              <AdminApp />
            </div>
        </div>

        <UnifiedDialogs />
        
        <!-- Global auto-play lock dialog - 使用 Teleport + Transition，样式对齐更新日志弹窗 -->
        <Teleport to="body">
            <Transition name="fade">
                <div 
                    v-if="uiState.autoLocked" 
                    style="position:fixed; inset:0; z-index:20000; display:flex; align-items:center; justify-content:center; background:transparent;"
                >
                    <div 
                        class="release-notes-dialog"
                        style="border-radius:20px; padding:0; max-width:520px; width:92%; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.5) inset; overflow:hidden; transform:scale(1); transition:transform 0.2s;"
                        @click.stop
                    >
                        <!-- Header 对齐更新日志样式 -->
                        <div class="release-notes-header" style="display:flex; justify-content:space-between; align-items:center; padding:20px 24px; border-bottom:1px solid rgba(0,0,0,0.08); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <div style="width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg, #22c55e 0%, #16a34a 100%); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(22,163,74,0.4);">
                                    <i class="fas fa-play" style="color:white; font-size:16px;"></i>
                                </div>
                                <div>
                                    <h2 style="margin:0; font-size:20px; font-weight:800; color:var(--text, #333); letter-spacing:-0.5px;">自动播放进行中</h2>
                                    <div style="font-size:12px; color:var(--muted, #999); margin-top:2px;">Autoplay Lock</div>
                                </div>
                            </div>
                        </div>
                        <!-- Content -->
                        <div class="release-notes-content" style="flex:1; padding:18px 24px; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); display:flex; flex-direction:column; gap:14px;">
                            <div style="font-size:13px; color:var(--text, #333); line-height:1.8;">
                                控制面板当前处于自动播放锁定状态，为避免误操作，按钮和列表已临时禁用。若需恢复正常操作，请停止自动播放。
                            </div>
                            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:4px; flex-wrap:wrap;">
                                <a-button @click="toggleAutoplayPause">
                                    <i :class="uiState.autoplayIsPausedRef ? 'fas fa-play' : 'fas fa-pause'" style="margin-right:6px;"></i>
                                    {{ uiState.autoplayIsPausedRef ? '继续' : '暂停' }}
                                </a-button>
                                <a-button danger type="primary" @click="stopAutoplay">
                                    <i class="fas fa-stop-circle" style="margin-right:6px;"></i>停止自动播放
                                </a-button>
                            </div>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- 启动更新提示弹窗 - 样式对齐更新日志弹窗 -->
        <Teleport to="body">
          <Transition name="fade">
            <div 
              v-if="showUpdatePrompt" 
              style="position:fixed; inset:0; z-index:20010; display:flex; align-items:center; justify-content:center; background:transparent;"
            >
              <div 
                class="release-notes-dialog"
                style="border-radius:20px; padding:0; max-width:520px; width:92%; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.5) inset; overflow:hidden; transform:scale(1); transition:transform 0.2s;"
                @click.stop
              >
                <!-- Header -->
                <div class="release-notes-header" style="display:flex; justify-content:space-between; align-items:center; padding:20px 24px; border-bottom:1px solid rgba(0,0,0,0.08); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);">
                  <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(37,99,235,0.4);">
                      <i class="fas fa-arrow-alt-circle-up" style="color:white; font-size:18px;"></i>
                    </div>
                    <div>
                      <h2 style="margin:0; font-size:20px; font-weight:800; color:var(--text, #333); letter-spacing:-0.5px;">
                        {{ $t('about.update.promptTitle', { version: updatePromptInfo && updatePromptInfo.version ? updatePromptInfo.version : '' }) }}
                      </h2>
                      <div style="font-size:12px; color:var(--muted, #999); margin-top:2px;">
                        {{ updatePromptForce ? $t('about.update.promptForce') : $t('about.update.promptOptional') }}
                      </div>
                    </div>
                  </div>
                </div>
                <!-- Content -->
                <div class="release-notes-content" style="flex:1; padding:18px 24px; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); display:flex; flex-direction:column; gap:14px;">
                  <div style="font-size:13px; color:var(--text, #333); line-height:1.8;">
                    {{ $t('about.update.promptBody') }}
                  </div>
                  <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:4px; flex-wrap:wrap;">
                    <a-button v-if="!updatePromptForce" @click="handleUpdatePromptCancel">关闭</a-button>
                    <a-button v-else @click="handleUpdatePromptExit">退出应用</a-button>
                    <a-button type="primary" @click="handleUpdatePromptUpdate">
                      <i class="fas fa-download" style="margin-right:6px;"></i>立即重启
                    </a-button>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </Teleport>
    </div>
    </a-config-provider>
  
</template>
<script src="./App.js"></script>
