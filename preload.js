const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDisplay: async () => {
    try {
      return await ipcRenderer.invoke('open-display');
    } catch (e) {
      return false;
    }
  }
  ,
  lines: {
    list: async (dir) => {
      return await ipcRenderer.invoke('lines/list', dir);
    },
    read: async (filename, dir) => {
      return await ipcRenderer.invoke('lines/read', filename, dir);
    },
    save: async (filename, contentObj, dir) => {
      return await ipcRenderer.invoke('lines/save', filename, contentObj, dir);
    },
    delete: async (filename, dir) => {
      return await ipcRenderer.invoke('lines/delete', filename, dir);
    }
    ,
    openFolder: async (dir) => {
      return await ipcRenderer.invoke('lines/openFolder', dir);
    }
  }
  ,
  windowControls: {
    minimize: async () => { try { return await ipcRenderer.invoke('window/minimize'); } catch(e){return {ok:false,error:String(e)}} },
    toggleMax: async () => { try { return await ipcRenderer.invoke('window/toggleMax'); } catch(e){return {ok:false,error:String(e)}} },
    close: async () => { try { return await ipcRenderer.invoke('window/close'); } catch(e){return {ok:false,error:String(e)}} }
  }
  ,
  onMaxState: (cb) => {
    const listener = (e, state) => cb(state);
    ipcRenderer.on('window/maxstate', listener);
    return () => ipcRenderer.removeListener('window/maxstate', listener);
  }
});
