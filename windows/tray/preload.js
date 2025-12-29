/**
 * Preload script for VibeTunnel tray app
 *
 * This script runs in the renderer process before the web page loads.
 * It provides a bridge between the renderer and main process.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('vibetunnel', {
  // Add any IPC methods here if needed in the future
  getStatus: () => ipcRenderer.invoke('get-status'),
  startService: () => ipcRenderer.invoke('start-service'),
  stopService: () => ipcRenderer.invoke('stop-service'),
});
