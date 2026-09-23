import { create } from 'zustand'
import { trackDownload } from '../api.js'
import useAppStore from './appStore.js'

const useDownloadStore = create((set, get) => ({
  queue: [],
  active: {},
  completed: 0,
  maxConcurrent: 3,

  async init() {
    const max = await window.electronAPI.getConfigKey('maxDownloads')
    if (max) set({ maxConcurrent: max })

    window.electronAPI.onDownloadProgress((data) => {
      get().updateProgress(data)
    })
  },

  addToQueue(modInfo, token, addToast) {
    const { queue, active } = get()
    const exists = queue.some((m) => m.modId === modInfo.modId) || active[modInfo.modId]
    if (exists) {
      addToast?.(`"${modInfo.modName}" is already in queue`, 'warning')
      return
    }
    set((s) => ({ queue: [...s.queue, { ...modInfo, addedAt: Date.now() }] }))
    addToast?.(`Added "${modInfo.modName}" to queue`, 'success')
    get().processQueue(token)
  },

  async processQueue(token) {
    const modsFolder = await window.electronAPI.getConfigKey('modsFolder')
    if (!modsFolder) return

    const { active, queue, maxConcurrent } = get()
    const slots = maxConcurrent - Object.keys(active).length
    if (slots <= 0 || queue.length === 0) return

    const toStart = queue.slice(0, slots)
    set((s) => ({ queue: s.queue.slice(toStart.length) }))
    toStart.forEach((mod) => get().startDownload(mod, token))
  },

  async startDownload(mod, token) {
    set((s) => ({
      active: { ...s.active, [mod.modId]: { ...mod, progress: 0, speed: 0, eta: 0 } }
    }))

    try {
      await trackDownload(mod.modId, token)
      await window.electronAPI.startDownload({
        modId: mod.modId,
        modName: mod.modName,
        modVersion: mod.modVersion || '1.0.0'
      })
      set((s) => {
        const next = { ...s.active }
        delete next[mod.modId]
        return { active: next, completed: s.completed + 1 }
      })
    } catch (err) {
      set((s) => {
        const next = { ...s.active }
        delete next[mod.modId]
        return { active: next }
      })
      if (!err?.cancelled) {
        useAppStore.getState().addToast?.(`Failed to download "${mod.modName}"`, 'error')
      }
    }

    get().processQueue(token)
  },

  updateProgress(data) {
    set((s) => {
      if (!s.active[data.modId]) return s
      return {
        active: {
          ...s.active,
          [data.modId]: { ...s.active[data.modId], progress: data.progress, speed: data.speed, eta: data.eta }
        }
      }
    })
  },

  cancelDownload(modId) {
    window.electronAPI.cancelDownload(modId)
    set((s) => {
      const next = { ...s.active }
      delete next[modId]
      return { active: next }
    })
    get().processQueue()
  },

  removeFromQueue(modId) {
    set((s) => ({ queue: s.queue.filter((m) => m.modId !== modId) }))
  },

  setMaxConcurrent(n) {
    set({ maxConcurrent: n })
  }
}))

export default useDownloadStore
