import { create } from 'zustand'
import { verifyAppToken, appLogout } from '../api.js'

const useAppStore = create((set, get) => ({
  page: 'loading',
  token: null,
  user: null,
  toasts: [],

  setPage: (page) => set({ page }),

  async init() {
    const token = await window.electronAPI.getConfigKey('authToken')
    if (!token) return set({ page: 'login' })

    const result = await verifyAppToken(token)
    if (result.success && result.user) {
      set({ token, user: result.user })
      const modsFolder = await window.electronAPI.getConfigKey('modsFolder')
      set({ page: modsFolder ? 'dashboard' : 'setup' })
    } else {
      await window.electronAPI.setConfig('authToken', null)
      set({ page: 'login' })
    }
  },

  async loginWithToken(token) {
    const result = await verifyAppToken(token)
    if (result.success && result.user) {
      await window.electronAPI.setConfig('authToken', token)
      set({ token, user: result.user })
      const modsFolder = await window.electronAPI.getConfigKey('modsFolder')
      set({ page: modsFolder ? 'dashboard' : 'setup' })
      return { success: true }
    }
    return { success: false, error: result.error || 'Authentication failed' }
  },

  async logout() {
    const { token } = get()
    if (token) {
      try { await appLogout(token) } catch {}
    }
    await window.electronAPI.setConfig('authToken', null)
    set({ token: null, user: null, page: 'login' })
  },

  async onSetupComplete() {
    set({ page: 'dashboard' })
  },

  addToast(message, type = 'info') {
    const id = Date.now()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3500)
  },

  removeToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
}))

export default useAppStore
