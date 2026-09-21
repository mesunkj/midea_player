import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 給 Renderer Process
contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectories: () => ipcRenderer.invoke('dialog:openDirectory'),
  scanDirectories: (dirPaths: string[], recursive: boolean, subDirKeyword: string) => ipcRenderer.invoke('files:scan', dirPaths, recursive, subDirKeyword),
  getAiCropData: (imagePath: string) => ipcRenderer.invoke('ai:get-crop-data', imagePath),
  saveImage: (imagePath: string) => ipcRenderer.invoke('image:save', imagePath),
  snapshot: () => ipcRenderer.invoke('app:snapshot')
});
