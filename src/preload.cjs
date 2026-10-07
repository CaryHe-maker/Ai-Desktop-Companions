const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('deskbot', {
  invoke: (name, value) => {
    if (!['init','settings','save-settings','login','logout','models','send','stop','history','sessions','session-new','session-open','session-rename','session-delete','choose-images','clipboard-image','open-link','action','web-action'].includes(name)) throw new Error('Unknown operation');
    return ipcRenderer.invoke(name, value);
  },
  signal: (name, value) => { if (['hit-test','drag-start','drag-end','wander','chat-open','pet-menu'].includes(name)) ipcRenderer.send(name, value); },
  on: (name, callback) => {
    if (!['chat-event','pet-state','pet-action','web-status'].includes(name)) return;
    const listener = (_e, data) => callback(data); ipcRenderer.on(name, listener);
    return () => ipcRenderer.removeListener(name, listener);
  }
});
