const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smartDeskStorage', {
  type: 'sqlite',
  getItem(key) {
    return ipcRenderer.sendSync('smartdesk:storage:get', key);
  },
  setItem(key, value) {
    return ipcRenderer.sendSync('smartdesk:storage:set', key, value);
  },
  removeItem(key) {
    return ipcRenderer.sendSync('smartdesk:storage:remove', key);
  },
  clear() {
    return ipcRenderer.sendSync('smartdesk:storage:clear');
  },
  getDatabasePath() {
    return ipcRenderer.sendSync('smartdesk:storage:path');
  },
});

contextBridge.exposeInMainWorld('smartDeskApp', {
  openCdsApp() {
    ipcRenderer.send('smartdesk:window:open-cds');
  },
  getSyncServerUrl() {
    return ipcRenderer.sendSync('smartdesk:sync:url');
  },
});
