const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('deskbot', {
  invoke: (name, value) => {
    if (!['init','settings','save-settings','open-link','action','web-action'].includes(name)) throw new Error('Unknown operation');
    return ipcRenderer.invoke(name, value);
  },
  signal: (name, value) => { if (['hit-test','drag-start','drag-end','wander','chat-open','pet-menu'].includes(name)) ipcRenderer.send(name, value); },
  on: (name, callback) => {
    if (!['pet-state','pet-action','web-status'].includes(name)) return;
    const listener = (_e, data) => callback(data); ipcRenderer.on(name, listener);
    return () => ipcRenderer.removeListener(name, listener);
  }
});
