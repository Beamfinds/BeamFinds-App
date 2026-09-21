import { useState } from 'react'
import useAppStore from '../store/appStore.js'
import useDownloadStore from '../store/downloadStore.js'
import { checkBatchUpdates } from '../api.js'

const PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"%3E%3Crect fill="%23333" width="60" height="60"/%3E%3Ctext x="30" y="35" text-anchor="middle" fill="%23666" font-size="20"%3E?%3C/text%3E%3C/svg%3E'

export default function Updates({ setUpdatesBadge }) {
  const { token, addToast, setPage } = useAppStore()
  const { addToQueue } = useDownloadStore()
  const [status, setStatus] = useState('idle')
  const [updates, setUpdates] = useState([])
  const [selected, setSelected] = useState(new Set())

  const check = async () => {
    setStatus('checking')
    const downloads = await window.electronAPI.getConfigKey('downloads') || {}
    const modIds = Object.keys(downloads)
    if (!modIds.length) { setStatus('none'); return }

    const mods = modIds.map((id) => ({ id, version: downloads[id].version }))
    const result = await checkBatchUpdates(mods, token)
    const list = (result.updates || []).map((u) => ({
      modId: String(u.id),
      name: u.name || downloads[u.id]?.name || 'Unknown',
      currentVersion: u.currentVersion,
      latestVersion: u.latestVersion,
      thumbnail: u.thumbnail
    }))
    setUpdates(list)
    setSelected(new Set(list.map((u) => u.modId)))
    setUpdatesBadge?.(list.length)
    setStatus(list.length ? 'found' : 'uptodate')
  }

  const queueUpdate = (u) => {
    addToQueue({ modId: u.modId, modName: u.name, modAuthor: 'Unknown', modVersion: u.latestVersion }, token, addToast)
    setPage('dashboard')
  }

  const queueSelected = () => {
    const toUpdate = updates.filter((u) => selected.has(u.modId))
    toUpdate.forEach((u) => addToQueue({ modId: u.modId, modName: u.name, modAuthor: 'Unknown', modVersion: u.latestVersion }, token, addToast))
    addToast(`Added ${toUpdate.length} update(s) to queue`, 'success')
    setPage('dashboard')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading font-bold text-2xl">Check for Updates</h1>
        <button onClick={check} disabled={status === 'checking'} className="btn-primary text-sm">
          {status === 'checking' ? <><i className="fas fa-spinner fa-spin" /> Checking...</> : <><i className="fas fa-sync-alt" /> Check Now</>}
        </button>
      </div>

      {status === 'idle' && (
        <div className="empty-state"><i className="fas fa-sync-alt" /><p>Click "Check Now" to scan for mod updates</p></div>
      )}
      {status === 'checking' && (
        <div className="loading-state"><i className="fas fa-spinner fa-spin" /><p>Checking for updates...</p></div>
      )}
      {status === 'none' && (
        <div className="empty-state"><i className="fas fa-box-open" /><p>No downloaded mods found</p></div>
      )}
      {status === 'uptodate' && (
        <div className="empty-state" style={{ color: '#2ecc71' }}><i className="fas fa-check-circle" /><p style={{ color: '#94a3b8' }}>All mods are up to date!</p></div>
      )}
      {status === 'found' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-muted">{updates.length} update{updates.length !== 1 ? 's' : ''} available</p>
            <button onClick={queueSelected} disabled={selected.size === 0} className="btn-primary text-sm">
              <i className="fas fa-download" /> Update Selected ({selected.size})
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {updates.map((u) => (
              <div key={u.modId} className="glass-card px-4 py-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(u.modId)}
                  onChange={(e) => { const s = new Set(selected); e.target.checked ? s.add(u.modId) : s.delete(u.modId); setSelected(s) }}
                  className="w-4 h-4"
                />
                <img src={u.thumbnail ? `https://beamfinds.com/uploads/${u.thumbnail}` : PLACEHOLDER} alt={u.name} className="w-12 h-12 rounded-lg object-cover" onError={(e) => { e.target.src = PLACEHOLDER }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{u.name}</p>
                  <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                    <span className="line-through">v{u.currentVersion}</span>
                    <i className="fas fa-arrow-right text-xs opacity-50" />
                    <span style={{ color: '#2ecc71' }}>v{u.latestVersion}</span>
                  </div>
                </div>
                <button onClick={() => queueUpdate(u)} className="btn-primary text-xs px-3 py-1.5">Update</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
