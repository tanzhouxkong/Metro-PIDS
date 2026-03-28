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
  }}
