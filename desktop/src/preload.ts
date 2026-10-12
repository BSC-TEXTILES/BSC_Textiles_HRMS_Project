/**
 * BSC Textiles HRMS — Desktop Preload Bridge
 * Context isolation enabled. Secure IPC message routing.
 */

import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  appVersion: string;
  getSystemInfo: () => Promise<any>;
  triggerBackup: () => Promise<any>;
  triggerRestore: () => Promise<any>;
  openDataDirectory: () => Promise<any>;
  printA4Document: () => Promise<any>;
  openExternalUrl: (url: string) => Promise<any>;
  onOfflineStatusChange: (callback: (isOffline: boolean) => void) => void;
}

const electronAPI: ElectronAPI = {
  isElectron: true,
  platform: process.platform,
  appVersion: '1.0.0',

  getSystemInfo: () => ipcRenderer.invoke('desktop:get-system-info'),
  triggerBackup: () => ipcRenderer.invoke('desktop:trigger-backup'),
  triggerRestore: () => ipcRenderer.invoke('desktop:trigger-restore'),
  openDataDirectory: () => ipcRenderer.invoke('desktop:open-data-directory'),
  printA4Document: () => ipcRenderer.invoke('desktop:print-document'),
  openExternalUrl: (url: string) => ipcRenderer.invoke('desktop:open-external', url),

  onOfflineStatusChange: (callback: (isOffline: boolean) => void) => {
    ipcRenderer.on('desktop:offline-status', (_event, isOffline) => {
      callback(isOffline);
    });
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
