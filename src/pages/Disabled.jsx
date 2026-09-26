import { useState, useEffect, useCallback } from 'react'
import useAppStore from '../store/appStore.js'

function formatSize(bytes) {
  if (!bytes) return null
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString()
}

export default function Disabled({ onDisabledChange }) {
  const { addToast } = useAppStore()
  const [mods, setMods] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setMods(await window.electronAPI.modsListDisabled())
    } catch (e) {
      setMods([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const enable = async (mod) => {
    const res = await window.electronAPI.modsEnable(mod.relPath)
    if (!res.success) { addToast(res.error, 'error'); return }
    setMods((m) => m.filter((x) => x.relPath !== mod.relPath))
    addToast(`${mod.displayName} enabled`, 'success')
    onDisabledChange?.()
  }

  const trash = async (mod) => {
    if (!confirm(`Delete ${mod.displayName}?\n\nIt will be moved to your Recycle Bin.`)) return
    const res = await window.electronAPI.modsTrash('disabled', mod.relPath)
    if (!res.success) { addToast(res.error, 'error'); return }
    setMods((m) => m.filter((x) => x.relPath !== mod.relPath))
    addToast(`${mod.displayName} deleted`, 'success')
    onDisabledChange?.()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-heading font-bold text-2xl">Disabled Mods</h1>
          <p className="text-xs text-text-muted mt-1">Moved out of your mods folder. BeamNG will not load them until you enable them again.</p>
        </div>
        <button onClick={load} className="btn-ghost text-sm"><i className="fas fa-sync-alt" /> Refresh</button>
      </div>

      {loading ? (
        <div className="loading-state"><i className="fas fa-spinner fa-spin" /><p>Loading...</p></div>
      ) : mods.length === 0 ? (
        <div className="empty-state"><i className="fas fa-power-off" /><p>Nothing is disabled</p></div>
      ) : (
        <>
          <p className="text-sm text-text-muted">{mods.length} mod{mods.length !== 1 ? 's' : ''} disabled</p>
          <div className="flex flex-col gap-2">
            {mods.map((mod) => (
              <div key={mod.relPath} className="glass-card px-4 py-3 flex items-center gap-3">
                <i className="fas fa-file-archive text-text-muted" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{mod.displayName}</p>
                  <p className="text-xs text-text-muted truncate">
                    {mod.relPath}
                    {formatSize(mod.size) ? ` · ${formatSize(mod.size)}` : ''}
                    {formatDate(mod.disabledAt) ? ` · disabled ${formatDate(mod.disabledAt)}` : ''}
                    {mod.conflictedWith ? ` · conflicted with ${mod.conflictedWith}` : ''}
                  </p>
                </div>
                <button onClick={() => enable(mod)} className="btn-primary text-xs px-3 py-1.5">
                  <i className="fas fa-power-off" /> Enable
                </button>
                <button onClick={() => trash(mod)} className="btn-danger text-xs px-2 py-1.5">
                  <i className="fas fa-trash" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
