export default {
  name: 'WindowControls',
  setup() {
    async function winMin() {
      if (window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.minimize) {
        await window.electronAPI.windowControls.minimize();
        return;
      }
      try { window.blur(); } catch(e){}
    }

    async function winMax() {
      if (window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.toggleMax) {
        await window.electronAPI.windowControls.toggleMax();
        return;
      }
      if (!document.fullscreenElement) {
        try { await document.documentElement.requestFullscreen(); } catch(e){}
      } else {
        try { await document.exitFullscreen(); } catch(e){}
      }
    }

    async function winClose() {
      if (window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.close) {
        await window.electronAPI.windowControls.close();
        return;
      }
      try { window.close(); } catch(e){ alert('无法在此环境下关闭窗口'); }
    }

    return { winMin, winMax, winClose };
  },
  template: `
    <div id="windowControls" style="
      display: flex;
      height: 100%;
      -webkit-app-region: no-drag;
      align-items: center;
      gap: 0;
    ">
      <!-- 现代化窗口控制按钮 -->
      <button 
        @click="winMin" 
        class="win-btn win-btn-min" 
        title="最小化"
        style="
          width: 46px;
          height: 100%;
          border: none;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
          color: var(--text, #333);
        "
        @mouseenter="$event.target.style.backgroundColor = 'rgba(0, 0, 0, 0.06)'"
        @mouseleave="$event.target.style.backgroundColor = 'transparent'"
      >
        <i class="fas fa-minus" style="font-size: 11px;"></i>
      </button>
      <button 
        @click="winMax" 
        class="win-btn win-btn-max" 
        title="最大化/还原"
        style="
          width: 46px;
          height: 100%;
          border: none;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
          color: var(--text, #333);
        "
        @mouseenter="$event.target.style.backgroundColor = 'rgba(0, 0, 0, 0.06)'"
        @mouseleave="$event.target.style.backgroundColor = 'transparent'"
      >
        <i class="fas fa-window-maximize" style="font-size: 11px;"></i>
      </button>
      <button 
        @click="winClose" 
        class="win-btn win-btn-close" 
        title="关闭"
        style="
          width: 46px;
          height: 100%;
          border: none;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s, color 0.2s;
          color: var(--text, #333);
        "
        @mouseenter="$event.target.style.backgroundColor = '#e81123'; $event.target.style.color = '#fff'"
        @mouseleave="$event.target.style.backgroundColor = 'transparent'; $event.target.style.color = 'var(--text, #333)'"
      >
        <i class="fas fa-times" style="font-size: 12px;"></i>
      </button>
    </div>
  `
}
