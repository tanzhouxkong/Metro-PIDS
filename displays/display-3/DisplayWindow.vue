<template>
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
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
                <div class="door-arrow l-arrow">
                  <i class="fas fa-chevron-left"></i>
                </div>
                <div class="as-door-img">
                  <i class="fas fa-door-open"></i>
                </div>
                <div class="door-arrow r-arrow">
                  <i class="fas fa-chevron-right"></i>
                </div>
              </div>
              <div class="as-door-text">
                <div id="as-door-msg-cn" class="as-door-t-cn">左侧开门</div>
                <div id="as-door-msg-en" class="as-door-t-en">Left side doors open</div>
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
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
>>>>>>> Stashed changes
  <div id="display-app" ref="rootRef" class="exit-indicator">
    <!-- 左侧信息面板 40% -->
    <div class="panel-left">
      <!-- 顶部 线路信息 -->
      <div class="top-section">
        <div class="metro-logo">北京地铁</div>
        <div class="line-display">
          <span class="line-number" id="line-num">10</span>
          <span class="line-name">Line 10</span>
        </div>
        <div class="time-info">
          <div class="time" id="current-time">10:21</div>
          <div class="date" id="current-date">2025-05-21</div>
        </div>
      </div>

      <!-- 循环/方向标签 -->
      <div class="loop-tag" id="loop-tag">
        <span class="loop-label">内环</span>
        <span class="loop-name">Circulation Loop</span>
      </div>

      <!-- 下一站信息 -->
      <div class="next-station-section">
        <div class="station-label">
          <span class="cn-text">下一站</span>
          <span class="en-text">Next Station</span>
        </div>
        <div class="station-name" id="next-station">公主坡</div>
        <div class="station-name-en" id="next-station-en">Gongzhufen</div>
      </div>

      <!-- 换乘信息 -->
      <div class="transfer-section">
        <div class="transfer-label">可换乘</div>
        <span class="transfer-text">Transfer to</span>
        <div class="transfer-lines">
          <div class="transfer-line" id="transfer-line-1">1号线</div>
          <div class="transfer-line" id="transfer-line-2"></div>
        </div>
      </div>
    </div>

    <!-- 右侧地图面板 60% -->
    <div class="panel-right">
      <!-- 蓝色弧形背景和站点图 -->
      <svg class="map-background" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice">
        <!-- 蓝色渐变弧形 -->
        <defs>
          <linearGradient id="arcGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#4DB8E8;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#2196F3;stop-opacity:1" />
          </linearGradient>
        </defs>
        <path d="M 100 0 Q 600 -200 1100 0 L 1100 600 Q 600 700 100 600 Z" fill="url(#arcGradient)" />
        
        <!-- 站点信息 -->
        <g id="stations-group">
          <!-- 站点将由JavaScript动态生成 -->
        </g>
      </svg>

      <!-- 站点列表层 -->
      <div class="stations-list" id="stations-list">
        <div class="station-item" id="station-item-0">
          <div class="station-dot"></div>
          <div class="station-text">
            <div class="station-cn">莲花桥</div>
            <div class="station-en">Lianhuaqiao</div>
          </div>
        </div>
        <div class="station-item highlight" id="station-item-1">
          <div class="station-dot current"></div>
          <div class="station-text highlight-station">
            <div class="station-cn">公主坡</div>
            <div class="station-en">Gongzhufen</div>
          </div>
        </div>
        <div class="station-item" id="station-item-2">
          <div class="station-dot"></div>
          <div class="station-text">
            <div class="station-cn">西钓鱼台</div>
            <div class="station-en">Xidiayoutai</div>
          </div>
        </div>
      </div>

      <!-- 出门指引区 -->
      <div class="exit-guide">
        <div class="guide-arrows">
          <div class="arrow-btn left-arrow">←</div>
          <div class="arrow-btn right-arrow">→</div>
        </div>
        <div class="guide-text">
          <div class="guide-cn" id="guide-cn">本侧开门</div>
          <div class="guide-en" id="guide-en">Please exit from this door</div>
        </div>
<<<<<<< Updated upstream
=======
>>>>>>> 5e6badfcb798ff4bb795199c1cd04aeb2a4d3fcc
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
import { initExitIndicator } from './displayWindowLogic.js';
=======
<<<<<<< HEAD
// 显示器1 本目录显示逻辑（displayWindowLogic.js），默认直线布局，可通过状态栏按钮切换为 C 型；显示器3 也引用此逻辑
import { initDisplayWindow } from './displayWindowLogic.js';
=======
import { initExitIndicator } from './displayWindowLogic.js';
>>>>>>> 5e6badfcb798ff4bb795199c1cd04aeb2a4d3fcc
>>>>>>> Stashed changes
=======
// 显示器1 本目录显示逻辑（displayWindowLogic.js），默认直线布局，可通过状态栏按钮切换为 C 型；显示器3 也引用此逻辑
import { initDisplayWindow } from './displayWindowLogic.js';
>>>>>>> Stashed changes
=======
// 显示器1 本目录显示逻辑（displayWindowLogic.js），默认直线布局，可通过状态栏按钮切换为 C 型；显示器3 也引用此逻辑
import { initDisplayWindow } from './displayWindowLogic.js';
>>>>>>> Stashed changes
=======
// 显示器1 本目录显示逻辑（displayWindowLogic.js），默认直线布局，可通过状态栏按钮切换为 C 型；显示器3 也引用此逻辑
import { initDisplayWindow } from './displayWindowLogic.js';
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
  cleanup = initDisplayWindow(rootRef.value);
});

onBeforeUnmount(() => {
  if (cleanup) {
  cleanup();
    cleanup = null;
  }
});
</script>
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
>>>>>>> Stashed changes
  cleanup = initExitIndicator(rootRef.value) || (() => {});
});

onBeforeUnmount(() => {
  if (typeof cleanup === 'function') {
    cleanup();
  }
});
</script>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#display-app.exit-indicator {
  width: 100%;
  height: 100%;
  display: flex;
  background-color: #000;
  font-family: 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
  overflow: hidden;
}

/* 左侧面板 40% */
.panel-left {
  width: 40%;
  height: 100%;
  background-color: #1a1a1a;
  padding: 20px 25px;
  display: flex;
  flex-direction: column;
  border-right: 2px solid #444;
  color: #fff;
  position: relative;
}

/* 顶部线路信息 */
.top-section {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #444;
}

.metro-logo {
  font-size: 12px;
  color: #0088ff;
  font-weight: bold;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  margin-right: 5px;
}

.line-display {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.line-number {
  font-size: 48px;
  font-weight: bold;
  color: #0088ff;
  line-height: 1;
  background: linear-gradient(135deg, #0088ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.line-name {
  font-size: 12px;
  color: #aaa;
}

.time-info {
  margin-left: auto;
  text-align: right;
}

.time {
  font-size: 32px;
  font-weight: bold;
  color: #fff;
  line-height: 1;
}

.date {
  font-size: 12px;
  color: #888;
  margin-top: 2px;
}

/* 循环标签 */
.loop-tag {
  background: linear-gradient(135deg, #ff6b6b 0%, #ff8787 100%);
  padding: 8px 12px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 30px;
  width: fit-content;
  box-shadow: 0 2px 8px rgba(255, 107, 107, 0.3);
}

.loop-label {
  font-size: 16px;
  font-weight: bold;
  color: #fff;
}

.loop-name {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.9);
}

/* 下一站信息 */
.next-station-section {
  margin-bottom: 40px;
}

.station-label {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #00bfff;
}

.cn-text {
  font-weight: bold;
}

.en-text {
  font-size: 11px;
  color: #0099dd;
}

.station-name {
  font-size: 36px;
  font-weight: bold;
  color: #fff;
  line-height: 1;
}

.station-name-en {
  font-size: 14px;
  color: #00bfff;
  margin-top: 4px;
}

/* 换乘信息 */
.transfer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.transfer-label {
  font-size: 14px;
  color: #888;
}

.transfer-text {
  font-size: 12px;
  color: #666;
}

.transfer-lines {
  display: flex;
  gap: 8px;
}

.transfer-line {
  background: linear-gradient(135deg, #ff3333 0%, #ff5555 100%);
  padding: 6px 12px;
  border-radius: 3px;
  font-size: 14px;
  font-weight: bold;
  color: #fff;
  min-width: 50px;
  text-align: center;
}

/* 右侧面板 60% */
.panel-right {
  width: 60%;
  height: 100%;
  background: linear-gradient(135deg, #0099ff 0%, #00ccff 100%);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* 地图背景SVG */
.map-background {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}

/* 站点列表 */
.stations-list {
  position: absolute;
  left: 50px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.station-item {
  display: flex;
  align-items: center;
  gap: 12px;
  opacity: 0.7;
  transition: all 0.3s ease;
}

.station-item.highlight {
  opacity: 1;
  transform: scale(1.1);
}

.station-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.4);
  border: 2px solid rgba(255, 255, 255, 0.6);
}

.station-dot.current {
  background-color: #fff;
  border-color: #fff;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
}

.station-text {
  display: flex;
  flex-direction: column;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}

.station-text.highlight-station {
  color: #fff;
  font-weight: bold;
  font-size: 14px;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
}

.station-cn {
  font-size: inherit;
  font-weight: 600;
}

.station-en {
  font-size: 10px;
  opacity: 0.9;
  margin-top: 2px;
}

/* 出门指引区 */
.exit-guide {
  position: absolute;
  right: 40px;
  bottom: 40px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.guide-arrows {
  display: flex;
  align-items: center;
  gap: 20px;
  background-color: rgba(255, 255, 255, 0.9);
  padding: 15px 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.arrow-btn {
  width: 40px;
  height: 40px;
  background-color: #0099ff;
  color: #fff;
  border: 2px solid #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.arrow-btn:hover {
  background-color: #0077ff;
  transform: scale(1.1);
}

.guide-text {
  background-color: rgba(255, 255, 255, 0.95);
  padding: 12px 16px;
  border-radius: 6px;
  text-align: center;
  min-width: 140px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.guide-cn {
  font-size: 16px;
  font-weight: bold;
  color: #0099ff;
}

.guide-en {
  font-size: 11px;
  color: #888;
  margin-top: 4px;
}
</style>
<<<<<<< Updated upstream
=======
>>>>>>> 5e6badfcb798ff4bb795199c1cd04aeb2a4d3fcc
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
