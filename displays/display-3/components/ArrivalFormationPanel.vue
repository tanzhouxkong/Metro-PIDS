<template>
  <div class="formation-screen">
    <div class="formation-screen-bg"></div>
    <div class="formation-screen-panel formation-screen-panel-dark">
      <div class="formation-diagram-card formation-diagram-card-dark formation-image-card">
        <img
          v-if="imageSrc"
          :src="imageSrc"
          :alt="stationAlt || 'station image'"
          class="formation-station-image"
        />
        <div v-else class="formation-image-fallback">
          <div class="formation-image-fallback-copy">{{ fallbackWelcomeText }}</div>
          <div class="formation-image-fallback-line">{{ fallbackLineName }}</div>
        </div>
      </div>

      <div class="formation-car-strip-shell">
        <div class="formation-car-strip formation-car-strip-dark">
          <template v-for="car in flatCars" :key="car.key">
            <div
              class="formation-car-item"
              :class="{
                active: car.globalNo === activeCarNo,
                'edge-first': car.globalNo === 1,
                'edge-last': car.globalNo === profileTotal
              }"
            >
              <span
                v-if="(travelDirection === 'left' && car.globalNo === 1) || (travelDirection === 'right' && car.globalNo === profileTotal)"
                class="formation-edge-arrow"
                :class="[
                  `direction-${travelDirection}`,
                  car.globalNo === 1 ? 'edge-first' : 'edge-last'
                ]"
                aria-hidden="true"
              ></span>
              <div v-if="car.globalNo === activeCarNo" class="formation-current-tag" aria-hidden="true">
                <span class="formation-current-tag-body">
                  <span class="formation-current-tag-cn">当前车厢</span>
                  <span class="formation-current-tag-en">Present Carriage</span>
                </span>
                <span class="formation-current-tag-arrow"></span>
              </div>
              <div class="formation-car-box" :class="{ active: car.globalNo === activeCarNo }">
                {{ car.globalNo }}
              </div>
            </div>
            <div v-if="car.coupledAfter" class="formation-coupler-gap"></div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  imageSrc: {
    type: String,
    default: ''
  },
  stationAlt: {
    type: String,
    default: ''
  },
  fallbackWelcomeText: {
    type: String,
    default: ''
  },
  fallbackLineName: {
    type: String,
    default: ''
  },
  flatCars: {
    type: Array,
    default: () => []
  },
  activeCarNo: {
    type: Number,
    default: 1
  },
  travelDirection: {
    type: String,
    default: 'right'
  },
  profileTotal: {
    type: Number,
    default: 0
  }
})
</script>

<style scoped>
.formation-screen {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 0;
}

.formation-screen-bg {
  position: absolute;
  inset: 0;
  /* 背景交给外层 .display3-app::before 统一绘制，这里保持透明以保证视觉贯通 */
  background: transparent;
  opacity: 1;
}

.formation-screen-panel {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  border-radius: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  padding: 28px 34px 24px;
}

.formation-screen-panel-dark {
  justify-content: flex-start;
  align-items: stretch;
  gap: 0;
}

.formation-diagram-card {
  margin-top: 14px;
  flex: 1;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(244, 244, 244, 0.98) 100%);
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.formation-diagram-card-dark {
  width: 100%;
  max-width: 860px;
  margin-top: 0;
  flex: 0 1 auto;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(28, 28, 30, 0.96) 0%, rgba(10, 10, 12, 0.98) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 18px 50px rgba(0, 0, 0, 0.45);
  padding: 28px 26px 24px;
  gap: 20px;
}

.formation-image-card {
  position: absolute;
  top: 48px;
  left: 50%;
  transform: translateX(-50%);
  min-height: 400px;
  margin-top: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.formation-station-image {
  width: 100%;
  max-width: 860px;
  min-height: 400px;
  max-height: 400px;
  object-fit: contain;
  display: block;
}

.formation-image-fallback {
  width: 100%;
  max-width: 860px;
  min-height: 400px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 36px 48px;
  text-align: center;
  border-radius: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.formation-image-fallback-copy {
  font-size: 42px;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.96);
  text-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
}

.formation-image-fallback-line {
  font-size: 58px;
  line-height: 1.18;
  font-weight: 800;
  letter-spacing: 3px;
  color: #ffffff;
  text-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
}

.formation-car-strip-shell {
  position: absolute;
  left: 50%;
  bottom: 36px;
  transform: translateX(-50%);
  width: 100%;
  max-width: 860px;
  display: flex;
  justify-content: center;
  margin-top: 0;
  padding: 0;
}

.formation-car-strip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}

.formation-car-strip-dark {
  margin-top: 0;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0;
  padding-top: 56px;
}

.formation-car-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.formation-edge-arrow {
  position: absolute;
  top: 50%;
  width: 18px;
  height: 18px;
  transform: translateY(-50%);
  opacity: 0.92;
}

.formation-edge-arrow::before,
.formation-edge-arrow::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 9px;
  height: 9px;
  border-top: 3px solid rgba(255, 255, 255, 0.9);
  border-right: 3px solid rgba(255, 255, 255, 0.9);
  transform-origin: center;
}

.formation-edge-arrow.direction-right::before,
.formation-edge-arrow.direction-right::after {
  transform: translateY(-50%) rotate(45deg);
}

.formation-edge-arrow.direction-left::before,
.formation-edge-arrow.direction-left::after {
  transform: translateY(-50%) rotate(-135deg);
}

.formation-edge-arrow::before {
  left: 0;
}

.formation-edge-arrow::after {
  left: 14px;
}

.formation-edge-arrow.edge-first {
  left: -26px;
}

.formation-edge-arrow.edge-last {
  right: -26px;
}

.formation-car-box {
  min-width: 58px;
  height: 34px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(180deg, rgba(72, 72, 74, 0.94) 0%, rgba(44, 44, 46, 0.98) 100%);
  color: #f5f5f7;
  font-size: 22px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.formation-car-box.active {
  border-color: rgba(255, 255, 255, 0.1);
  background: linear-gradient(180deg, rgba(72, 72, 74, 0.94) 0%, rgba(44, 44, 46, 0.98) 100%);
  color: #f5f5f7;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  animation: formation-current-car-blink 2s step-end infinite;
}

.formation-current-tag {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%);
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  animation: formation-current-tag-blink 2s step-end infinite;
}

.formation-current-tag-arrow {
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 18px solid #f5a623;
  margin-top: -1px;
}

.formation-current-tag-body {
  min-width: 108px;
  padding: 4px 10px 5px;
  border-radius: 2px;
  border: 1px solid rgba(95, 58, 0, 0.5);
  background: linear-gradient(180deg, #ffb11f 0%, #f29718 100%);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.24);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.formation-current-tag-cn {
  font-size: 20px;
  font-weight: 800;
  color: #ffffff;
  line-height: 1.05;
}

.formation-current-tag-en {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 700;
  color: #fff8dc;
  line-height: 1.05;
  white-space: nowrap;
}

.formation-coupler-gap {
  width: 16px;
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.28);
}

@keyframes formation-current-tag-blink {
  0%,
  49.999%,
  100% {
    opacity: 1;
  }
  50%,
  99.999% {
    opacity: 0;
  }
}

@keyframes formation-current-car-blink {
  0%,
  49.999%,
  100% {
    border-color: rgba(95, 58, 0, 0.55);
    background: linear-gradient(180deg, #ffb11f 0%, #f29718 100%);
    color: #ffffff;
    box-shadow: 0 0 18px rgba(242, 151, 24, 0.35);
  }
  50%,
  99.999% {
    border-color: rgba(255, 255, 255, 0.1);
    background: linear-gradient(180deg, rgba(72, 72, 74, 0.94) 0%, rgba(44, 44, 46, 0.98) 100%);
    color: #f5f5f7;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }
}
</style>
