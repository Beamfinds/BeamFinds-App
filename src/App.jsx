import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useAppStore from './store/appStore.js'
import useDownloadStore from './store/downloadStore.js'
import Titlebar from './components/Titlebar.jsx'
import Sidebar from './components/Sidebar.jsx'
import Toast from './components/Toast.jsx'
import AppUpdateModal from './components/AppUpdateModal.jsx'
import PageErrorBoundary from './components/PageErrorBoundary.jsx'
import Login from './pages/Login.jsx'
import Setup from './pages/Setup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Installed from './pages/Installed.jsx'
import Updates from './pages/Updates.jsx'
import Conflicts from './pages/Conflicts.jsx'
import Disabled from './pages/Disabled.jsx'
import Playlist from './pages/Playlist.jsx'
import Settings from './pages/Settings.jsx'

const PAGES = { dashboard: Dashboard, installed: Installed, updates: Updates, conflicts: Conflicts, disabled: Disabled, playlist: Playlist, settings: Settings }

export default function App() {
  const { page, init, token, setPage } = useAppStore()
  const { init: initDownloads } = useDownloadStore()
  const [updatesBadge, setUpdatesBadge] = useState(0)
  const [disabledCount, setDisabledCount] = useState(0)
  const [appUpdate, setAppUpdate] = useState(null)

  const refreshDisabled = useCallback(async () => {
    try {
      const list = await window.electronAPI.modsListDisabled()
      setDisabledCount(list.length)
    } catch (e) {
      setDisabledCount(0)
    }
  }, [])

  useEffect(() => { if (token) refreshDisabled() }, [token, refreshDisabled])

  useEffect(() => {
    if (page === 'disabled' && disabledCount === 0) setPage('conflicts')
  }, [page, disabledCount, setPage])

  useEffect(() => { init() }, [])
  useEffect(() => { if (token) initDownloads() }, [token])

  useEffect(() => {
    if (!token) return
    const t = setTimeout(async () => {
      try {
        const result = await window.electronAPI.checkAppUpdate()
        if (result && (result.hasUpdate || result.beta?.hasUpdate)) {
          setAppUpdate(result)
        }
      } catch { }
    }, 1000)
    return () => clearTimeout(t)
  }, [token])

  useEffect(() => {
    window.electronAPI.onProtocolDownload(async (data) => {
      if (!data) return
      const modsFolder = await window.electronAPI.getConfigKey('modsFolder')
      if (!modsFolder) {
        useAppStore.getState().addToast('Please set your mods folder first', 'warning')
        return
      }
      useDownloadStore.getState().addToQueue(data, useAppStore.getState().token, useAppStore.getState().addToast)
      if (useAppStore.getState().page !== 'dashboard') {
        useAppStore.getState().setPage('dashboard')
      }
    })
  }, [])

  if (page === 'loading') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 flex items-center justify-center"
      >
        <i className="fas fa-spinner fa-spin text-2xl text-text-muted" />
      </motion.div>
    )
  }

  if (page === 'login') return (
    <div className="flex flex-col h-screen">
      <Titlebar />
      <Login />
      <Toast />
    </div>
  )

  if (page === 'setup') return (
    <div className="flex flex-col h-screen">
      <Titlebar />
      <Setup />
      <Toast />
    </div>
  )

  const PageComponent = PAGES[page] || Dashboard

  return (
    <div className="flex flex-col h-screen">
      <Titlebar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar updatesBadge={updatesBadge} showDisabled={disabledCount > 0} />
        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <PageErrorBoundary>
                <PageComponent setUpdatesBadge={setUpdatesBadge} onDisabledChange={refreshDisabled} />
              </PageErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <Toast />
      <AnimatePresence>
        {appUpdate && (
          <AppUpdateModal
            info={appUpdate}
            onClose={() => setAppUpdate(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
