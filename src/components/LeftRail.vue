<template>
  <div
    id="leftRail"
    class="left-rail-blur"
    style="position:relative; width:100%; height:100%; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding-top:60px; padding-bottom:0; overflow:hidden;"
  >
    <div
      id="railInner"
      style="width:100%; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:16px; flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding-bottom:8px; -webkit-overflow-scrolling:touch;"
    >
      <a-button
        class="left-rail-icon-btn"
        :type="uiState.activePanel === null ? 'primary' : 'default'"
        shape="round"
        :title="t('leftRail.home')"
        :style="getRailButtonStyle(uiState.activePanel === null)"
        @click="closePanel()"
      >
        <span class="left-rail-btn-content">
          <i class="fas fa-home left-rail-btn-icon"></i>
          <span class="left-rail-btn-label" :style="getRailLabelStyle(uiState.activePanel === null)">{{ t('leftRail.home') }}</span>
        </span>
      </a-button>

      <a-button
        class="left-rail-icon-btn"
        :type="uiState.activePanel === 'panel-1' ? 'primary' : 'default'"
        shape="round"
        :title="t('leftRail.console')"
        :style="getRailButtonStyle(uiState.activePanel === 'panel-1')"
        @click="togglePanel('panel-1')"
      >
        <span class="left-rail-btn-content">
          <i class="fas fa-sliders-h left-rail-btn-icon"></i>
          <span class="left-rail-btn-label" :style="getRailLabelStyle(uiState.activePanel === 'panel-1')">{{ t('leftRail.console') }}</span>
        </span>
      </a-button>

      <a-button
        class="left-rail-icon-btn"
        :type="uiState.showDisplay ? 'primary' : 'default'"
        shape="round"
        :title="`${t('leftRail.display')} - ${currentDisplayInfo.displayName}`"
        :style="getRailButtonStyle(uiState.showDisplay)"
        @click="handleDisplayAction()"
      >
        <span class="left-rail-btn-content">
          <i class="fas fa-desktop left-rail-btn-icon"></i>
          <span class="left-rail-btn-label" :style="getRailLabelStyle(uiState.showDisplay)">{{ t('leftRail.display') }}</span>
        </span>
      </a-button>

      <a-button
        v-if="shouldShowDevButton"
        class="left-rail-icon-btn"
        type="default"
        shape="round"
        :title="t('leftRail.developer')"
        :style="getRailButtonStyle(false)"
        @click="openDevWindow()"
      >
        <span class="left-rail-btn-content">
          <i class="fas fa-code left-rail-btn-icon"></i>
          <span class="left-rail-btn-label" :style="getRailLabelStyle(false)">{{ t('leftRail.developer') }}</span>
        </span>
      </a-button>
    </div>

    <div style="width:100%; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:12px; margin-top:auto; flex:0 0 auto;">
      <div style="position:relative; width:68px; display:flex; justify-content:center;">
        <a-tag
          v-if="hasUpdate"
          color="error"
          style="position:absolute; top:-6px; right:-8px; z-index:10; cursor:pointer; margin:0; line-height:18px; font-size:10px; font-weight:700; user-select:none;"
          :title="t('about.releaseNotes.title')"
          @click.stop="openReleaseNotes()"
        >NEW</a-tag>
        <a-button
          class="left-rail-icon-btn"
          :type="uiState.activePanel === 'panel-4' ? 'primary' : 'default'"
          shape="round"
          :title="t('leftRail.settings')"
          :style="getRailButtonStyle(uiState.activePanel === 'panel-4')"
          @click="togglePanel('panel-4')"
        >
          <span class="left-rail-btn-content">
            <i class="fas fa-cog left-rail-btn-icon"></i>
            <span class="left-rail-btn-label" :style="getRailLabelStyle(uiState.activePanel === 'panel-4')">{{ t('leftRail.settings') }}</span>
          </span>
        </a-button>
      </div>

      <a-button
        class="left-rail-icon-btn"
        type="default"
        shape="round"
        :title="t('leftRail.github')"
        :style="getRailButtonStyle(false)"
        @click="openGithub()"
      >
        <span class="left-rail-btn-content">
          <i class="fab fa-github left-rail-btn-icon"></i>
          <span class="left-rail-btn-label" :style="getRailLabelStyle(false)">{{ t('leftRail.github') }}</span>
        </span>
      </a-button>
    </div>
  </div>
</template>

<script src="./LeftRail.js"></script>

<style scoped>
.left-rail-icon-btn {
  width: 68px;
  min-width: 68px;
  height: 64px;
  padding: 8px 6px !important;
  border-radius: 18px !important;
}

.left-rail-btn-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  line-height: 1;
  color: currentColor;
}

.left-rail-btn-icon {
  font-size: 18px;
  line-height: 1;
  color: currentColor;
}

.left-rail-btn-label {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.1;
  color: currentColor;
  white-space: nowrap;
}
</style>
