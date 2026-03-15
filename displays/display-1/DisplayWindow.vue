<template>
  <div id="display-app" ref="rootRef">
    <div id="scaler">
      <div class="header">
        <div class="h-left">
          <div class="app-title">Metro PIDS</div>
          <div class="line-info">
            <div id="d-line-no" class="line-badge">--</div>
          </div>
        </div>
        <div class="h-next">
          <div class="lbl">
            下一站
            <span class="en">Next Station</span>
          </div>
          <div class="val">
            <span id="d-next-st">--</span>
          </div>
        </div>
        <div class="h-door"></div>
        <div class="h-term">
          <div class="lbl">
            终点站
            <span class="en">Terminal Station</span>
          </div>
          <div class="val">
            --
            <span class="en">--</span>
          </div>
        </div>
      </div>
      <div id="rec-tip">REC</div>
      <div id="d-map" class="btm-map map-l"></div>
      <div id="arrival-screen">
        <div class="as-body">
          <div class="as-panel-left">
            <div class="as-door-area">
              <div class="as-door-graphic">
                <div class="as-door-img door-indicator">
                  <svg viewBox="-10 0 120 78" class="door-arrow-svg door-panel-icon" aria-hidden="true">
                    <defs>
                      <!-- 占位渐变：方向改为竖直，实际 stop 由 JS 按贯通段颜色动态重建 -->
                      <linearGradient id="display1DoorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="var(--theme)" />
                        <stop offset="100%" stop-color="var(--theme)" />
                      </linearGradient>
                    </defs>
                    <g class="door-leaf left">
                      <rect class="leaf-body" x="4" y="4" width="43" height="70" rx="4.5" />
                      <rect class="leaf-window" x="11" y="11" width="27" height="29" rx="4.5" />
                    </g>
                    <g class="door-leaf right">
                      <rect class="leaf-body" x="53" y="4" width="43" height="70" rx="4.5" />
                      <rect class="leaf-window" x="60" y="11" width="27" height="29" rx="4.5" />
                    </g>
                  </svg>
                  <svg
                    viewBox="0 0 100 100"
                    class="door-no-open-icon"
                    aria-hidden="true"
                  >
                    <circle cx="50" cy="50" r="38" fill="none" stroke="#ff1b12" stroke-width="12" />
                    <path d="M24 24L76 76" fill="none" stroke="#ff1b12" stroke-width="12" stroke-linecap="round" />
                  </svg>
                </div>
              </div>
              <div class="as-door-text">
                <div id="as-door-msg-cn" class="as-door-t-cn">本侧开门</div>
                <div id="as-door-msg-en" class="as-door-t-en">Doors will be opened on this side</div>
              </div>
            </div>
            <div class="as-car-area">
              <div class="as-car-exits"></div>
            </div>
          </div>
          <div class="as-panel-middle">
            <div class="as-car-badge">
              <div class="as-car-label">当前车厢</div>
              <div id="as-car-no" class="as-car-no">--</div>
              <div class="as-car-label-en">Car No.</div>
            </div>
          </div>
            <div class="as-panel-right">
              <div class="as-map-track"></div>
              <div class="as-map-nodes"></div>
            </div>
        </div>
      </div>
      <div id="welcome-end-screen">
        <div class="welcome-end-body"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';
// 显示器1 本目录显示逻辑（displayWindowLogic.js），默认直线布局，可通过状态栏按钮切换为 C 型；显示器3 也引用此逻辑
import { initDisplayWindow } from './displayWindowLogic.js';

const rootRef = ref(null);
let cleanup = () => {};

// 平台检测
const platform = ref('');
const isDarwin = computed(() => platform.value === 'darwin');
const isLinux = computed(() => platform.value === 'linux');

// 获取平台信息
if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.platform) {
  platform.value = window.electronAPI.platform;
}

onMounted(() => {
  cleanup = initDisplayWindow(rootRef.value);
});

onBeforeUnmount(() => {
  if (cleanup) {
  cleanup();
    cleanup = null;
  }
});
</script>
