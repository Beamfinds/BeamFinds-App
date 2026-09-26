import { useState } from 'react'
import { motion } from 'framer-motion'

function fmt(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function AppUpdateModal({ info, onClose }) {
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  const anyRequired = (info.updateRequired && !info.isBetaBuild) || (info.isBetaBuild && info.beta?.required)
  const hasStable = info.hasUpdate
  const hasBeta = info.beta?.hasUpdate && info.hasBetaAccess

  const startUpdate = async (version, isBeta) => {
    setDownloading(true)
    setError(null)
    window.electronAPI.onUpdateProgress((data) => {
      setProgress(data)
    })
    try {
      const result = isBeta
        ? await window.electronAPI.downloadBetaUpdate(version)
        : await window.electronAPI.downloadAppUpdate(version)
      if (result?.success) {
        await window.electronAPI.runUpdateInstaller(result.path)
      } else {
        throw new Error(result?.error || 'Download failed')
      }
    } catch (e) {
      setError(e.message)
      setDownloading(false)
      setProgress(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 pointer-events-auto"
        onClick={!anyRequired ? onClose : undefined}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="glass-card p-6 w-full max-w-sm flex flex-col gap-4 relative z-10 pointer-events-auto"
      >
        <div className="text-center">
          <h2 className="font-heading font-bold text-lg">
            {anyRequired ? '⚠️ Update Required' : '🎉 Update Available'}
          </h2>
          <p className="text-sm text-text-muted mt-1">
            {hasStable && hasBeta ? 'New versions are available!' : 'A new version of BeamFinds is available!'}
          </p>
          {anyRequired && <p className="text-xs mt-1" style={{ color: '#e74c3c' }}>This update is required to continue using the app.</p>}
        </div>

        {!downloading && (
          <div className="flex flex-col gap-2">
            {hasStable && (
              <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: 'rgba(52,152,219,0.08)', border: '1px solid rgba(52,152,219,0.2)' }}>
                <div className="flex-1">
                  <span className="text-xs font-medium text-text-muted uppercase">Stable</span>
                  {info.updateRequired && !info.isBetaBuild && <span className="ml-2 text-xs px-1 py-0.5 rounded" style={{ background: '#e74c3c22', color: '#e74c3c' }}>Required</span>}
                  <div className="flex items-center gap-2 text-sm mt-0.5">
                    <span className="line-through text-text-muted">v{info.currentVersion}</span>
                    <i className="fas fa-arrow-right text-xs opacity-40" />
                    <span style={{ color: '#2ecc71' }}>v{info.latestVersion}</span>
                  </div>
                </div>
                <button onClick={() => startUpdate(info.latestVersion, false)} className="btn-primary text-xs px-3 py-1.5">
                  <i className="fas fa-download" /> Update
                </button>
              </div>
            )}
            {hasBeta && (
              <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: 'rgba(155,89,182,0.08)', border: '1px solid rgba(155,89,182,0.2)' }}>
                <div className="flex-1">
                  <span className="text-xs font-medium text-text-muted uppercase">Beta</span>
                  {info.beta?.required && <span className="ml-2 text-xs px-1 py-0.5 rounded" style={{ background: '#e74c3c22', color: '#e74c3c' }}>Required</span>}
                  <div className="flex items-center gap-2 text-sm mt-0.5">
                    <span className="line-through text-text-muted">{info.isBetaBuild ? `v${info.currentVersion}` : 'Not installed'}</span>
                    <i className="fas fa-arrow-right text-xs opacity-40" />
                    <span style={{ color: '#9b59b6' }}>v{info.beta.version}</span>
                  </div>
                </div>
                <button onClick={() => startUpdate(info.beta.version, true)} className="btn-ghost text-xs px-3 py-1.5" style={{ borderColor: 'rgba(155,89,182,0.3)' }}>
                  <i className="fas fa-flask" /> Beta
                </button>
              </div>
            )}
          </div>
        )}

        {downloading && progress && (
          <div className="flex flex-col gap-2">
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress.progress || 0}%`, background: '#3498db' }} />
            </div>
            <p className="text-xs text-text-muted text-center">
              Downloading... {fmt(progress.downloaded)} / {fmt(progress.total)}
            </p>
          </div>
        )}

        {downloading && !progress && (
          <div className="flex items-center justify-center gap-2 text-sm text-text-muted py-2">
            <i className="fas fa-spinner fa-spin" /> Preparing download...
          </div>
        )}

        {error && <p className="text-xs text-center" style={{ color: '#e74c3c' }}>{error}</p>}

        {!anyRequired && !downloading && (
          <button onClick={onClose} className="btn-ghost text-sm justify-center">Later</button>
        )}
      </motion.div>
    </div>
  )
}
