const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Add any needed IPC mappings here
    // For now, the app works via HTTP requests to localhost:3002, so little is needed 
    // unless we want to control window state or native menus.
});
