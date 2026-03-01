import { createApp } from 'vue'
import { initDisplayWindow } from './displayWindowLogic.js'

console.log('========================================');
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
									<div class="door-arrow l-arrow"><i class="fas fa-chevron-left"></i></div>
									<div class="as-door-img"><i class="fas fa-door-open"></i></div>
									<div class="door-arrow r-arrow"><i class="fas fa-chevron-right"></i></div>
								</div>
								<div class="as-door-text">
									<div id="as-door-msg-cn" class="as-door-t-cn">左侧开门</div>
									<div id="as-door-msg-en" class="as-door-t-en">Left side doors open</div>
								</div>
							</div>
							<div class="as-car-area"><div class="as-car-exits"></div></div>
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
