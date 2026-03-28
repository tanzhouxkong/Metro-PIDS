<template>

    <div id="leftRail" class="left-rail-blur" style="position:relative; width:100%; height:100%; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding-top:60px; padding-bottom:0; overflow:hidden;">
      
      <!-- Top Section -->
      <div id="railInner" style="width:100%; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:16px; flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding-bottom:8px; -webkit-overflow-scrolling:touch;">
        
        <a-button
            class="left-rail-icon-btn"
            :type="uiState.activePanel === null ? 'primary' : 'default'"
            shape="round"
            @click="closePanel()"
            title="主页"
        >
            <i class="fas fa-home" style="font-size:20px;"></i>
        </a-button>
        
        <a-button
            class="left-rail-icon-btn"
            :type="uiState.activePanel === 'panel-1' ? 'primary' : 'default'"
            shape="round"
            @click="togglePanel('panel-1')"
            title="PIDS 控制台"
        >
            <i class="fas fa-sliders-h" style="font-size:20px;"></i>
        </a-button>

        <a-button
            class="left-rail-icon-btn"
            :type="uiState.showDisplay ? 'primary' : 'default'"
            shape="round"
            @click="handleDisplayAction()"
            :title="'显示预览 - ' + currentDisplayInfo.displayName"
        >
            <i class="fas fa-desktop" style="font-size:20px;"></i>
        </a-button>
        
        <a-button
            v-if="shouldShowDevButton"
            class="left-rail-icon-btn"
            type="default"
            shape="round"
            @click="openDevWindow()"
            title="开发者模式"
        >
            <i class="fas fa-code" style="font-size:20px;"></i>
        </a-button>
        
        <!-- third-party display button removed -->
      </div>

      <!-- Bottom Section -->
      <div style="width:100%; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:12px; margin-top:auto; flex:0 0 auto;">
         <div style="position:relative; width:48px; display:flex; justify-content:center;">
            <a-tag
                v-if="hasUpdate"
                color="error"
                style="position:absolute; top:-6px; right:-8px; z-index:10; cursor:pointer; margin:0; line-height:18px; font-size:10px; font-weight:700; user-select:none;"
                title="查看更新日志"
                @click.stop="openReleaseNotes()"
            >NEW</a-tag>
            <a-button
                class="left-rail-icon-btn"
                :type="uiState.activePanel === 'panel-4' ? 'primary' : 'default'"
                shape="round"
                @click="togglePanel('panel-4')"
                title="设置"
            >
                <i class="fas fa-cog" style="font-size:20px;"></i>
            </a-button>
        </div>
        <a-button
            class="left-rail-icon-btn"
            type="default"
            shape="round"
            @click="openGithub()"
            title="Github"
        >
            <i class="fab fa-github" style="font-size:20px;"></i>
        </a-button>
      </div>

    </div>
    
</template>
<script src="./LeftRail.js"></script>
