import { createApp } from 'vue'
import { initDisplayWindow } from './displayWindowLogic.js'
import { setupWindowThemeSync } from '../../src/utils/windowSettingsSync.js'

console.log('========================================');
setupWindowThemeSync()
console.log('[Display-1] 显示器1初始化 (主显示器，默认直线线路图，可切换 C 型)');
console.log('[Display-1] 期望尺寸: 1900 x 600');
console.log('[Display-1] 实际窗口尺寸:', window.innerWidth, 'x', window.innerHeight);
console.log('[Display-1] 屏幕尺寸:', window.screen.width, 'x', window.screen.height);
console.log('[Display-1] 设备像素比:', window.devicePixelRatio);
console.log('========================================');

// 监听窗口尺寸变化
window.addEventListener('resize', () => {
	console.log('[Display-1] 窗口尺寸变化:', window.innerWidth, 'x', window.innerHeight);
});

// 延迟检查（等待窗口完全加载）
setTimeout(() => {
	console.log('[Display-1] 延迟检查 - 窗口尺寸:', window.innerWidth, 'x', window.innerHeight);
	if (window.innerWidth !== 1900 || window.innerHeight !== 600) {
		console.warn('[Display-1] ⚠️ 窗口尺寸不匹配！期望: 1900x600, 实际:', window.innerWidth + 'x' + window.innerHeight);
	} else {
		console.log('[Display-1] ✅ 窗口尺寸正确');
	}
}, 1000);

function ensureBrowserFallbackDom() {
	let root = document.getElementById('display-app') || document.getElementById('display-root')
	if (!root) {
		root = document.createElement('div')
		root.id = 'display-app'
		document.body.appendChild(root)
	}
	if (root.id !== 'display-app') {
		root.id = 'display-app'
	}
	if (!root.querySelector('#scaler')) {
		root.innerHTML = `
			<div id="scaler">
				<div class="header">
					<div class="h-left">
						<div class="app-title">Metro PIDS</div>
						<div class="line-info"><div id="d-line-no" class="line-badge">--</div></div>
					</div>
					<div class="h-next">
						<div class="lbl">下一站<span class="en">Next Station</span></div>
						<div class="val"><span id="d-next-st">--</span></div>
					</div>
					<div class="h-door"></div>
					<div class="h-term">
						<div class="lbl">终点站<span class="en">Terminal Station</span></div>
						<div class="val">--<span class="en">--</span></div>
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
										<svg viewBox="0 0 100 100" class="door-no-open-icon" aria-hidden="true">
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
							<div class="as-car-area"><div class="as-car-exits"></div></div>
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
				<div id="welcome-end-screen"><div class="welcome-end-body"></div></div>
			</div>
		`
	}
	return root
}

async function mountDisplay() {
	const isElectronRuntime = typeof window !== 'undefined'
		&& !!(window.electronAPI || (window.process && window.process.type))

	if (!isElectronRuntime) {
		const root = ensureBrowserFallbackDom()
		initDisplayWindow(root)
		return
	}

	try {
		const mod = await import('./DisplayWindow.vue')
		const app = createApp(mod.default)
		app.mount('#display-root')
	} catch (error) {
		console.warn('[Display-1] Electron 环境下 Vue SFC 加载失败，回退到兼容模式:', error)
		const root = ensureBrowserFallbackDom()
		initDisplayWindow(root)
	}
}

mountDisplay()
