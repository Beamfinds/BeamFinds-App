import useAppStore from '../store/appStore.js'
import useDownloadStore from '../store/downloadStore.js'
import { formatSpeed, formatEta } from '../utils.js'

export default function Dashboard() {
  const { addToast } = useAppStore()
  const { active, queue, completed, cancelDownload, removeFromQueue } = useDownloadStore()

  const activeList = Object.values(active)
  const stats = [
    { label: 'Active', value: activeList.length, icon: 'fa-download', color: '#3498db' },
    { label: 'Queued', value: queue.length, icon: 'fa-clock', color: '#f39c12' },
    { label: 'Completed', value: completed, icon: 'fa-check', color: '#2ecc71' },
  ]

  const openFolder = async () => {
    const folder = await window.electronAPI.getConfigKey('modsFolder')
    if (folder) window.electronAPI.openFolder(folder)
    else addToast('Mods folder not configured', 'warning')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading font-bold text-2xl">Downloads</h1>
        <button onClick={openFolder} className="btn-ghost text-sm">
          <i className="fas fa-folder-open" /> Open Mods Folder
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map(({ label, value, icon, color }) => (
          <div key={label} className="glass-card px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
              <i className={`fas ${icon} text-sm`} style={{ color }} />
            </div>
            <div>
              <div className="font-heading font-bold text-xl leading-none">{value}</div>
              <div className="text-xs text-text-muted mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wide">Active Downloads</h2>
        {activeList.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-cloud-download-alt" />
            <p>No active downloads, downloads from beamfinds.com appear here</p>
          </div>
        ) : (
          activeList.map((d) => (
            <div key={d.modId} className="glass-card px-4 py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{d.modName}</p>
                <p className="text-xs text-text-muted">by {d.modAuthor} · v{d.modVersion || '1.0.0'}</p>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${d.progress || 0}%`, background: '#3498db' }} />
                </div>
                <div className="flex gap-3 mt-1 text-xs text-text-muted">
                  <span>{(d.progress || 0).toFixed(1)}%</span>
                  <span>{formatSpeed(d.speed || 0)}</span>
                  <span>ETA: {formatEta(d.eta || 0)}</span>
                </div>
              </div>
              <button onClick={() => cancelDownload(d.modId)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent/15 hover:text-accent text-text-muted transition-colors">
                <i className="fas fa-times text-sm" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wide">Queue</h2>
        {queue.length === 0 ? (
          <p className="text-sm text-text-muted px-1">Queue is empty</p>
        ) : (
          queue.map((d, i) => (
            <div key={d.modId} className="glass-card px-4 py-3 flex items-center gap-3">
              <span className="text-sm font-bold text-text-muted w-5 text-center">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{d.modName}</p>
                <p className="text-xs text-text-muted">by {d.modAuthor} · v{d.modVersion || '1.0.0'}</p>
              </div>
              <button onClick={() => removeFromQueue(d.modId)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent/15 hover:text-accent text-text-muted transition-colors">
                <i className="fas fa-times text-sm" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
