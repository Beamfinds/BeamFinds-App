import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useAppStore from '../store/appStore.js'
import { formatSize } from '../utils.js'

function formatAgo(iso) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff) || diff < 0) return null
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function pairKey(pair) {
  return `${pair.a.relPath}|${pair.b.relPath}`
}

const loadOrderNote = 'BeamNG has no defined load order, so which mod wins is unpredictable and can change between launches.'

function countsLabel(pair) {
  const bits = []
  if (pair.materials.length) bits.push(`${pair.materials.length} material${pair.materials.length !== 1 ? 's' : ''}`)
  if (pair.parts.length) bits.push(`${pair.parts.length} part name${pair.parts.length !== 1 ? 's' : ''}`)
  if (pair.files.length) bits.push(`${pair.files.length} file override${pair.files.length !== 1 ? 's' : ''}`)
  return bits.join(' · ')
}

export default function Conflicts({ onDisabledChange }) {
  const { addToast, setPage } = useAppStore()
  const [result, setResult] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [expanded, setExpanded] = useState(new Set())
  const [showHarmless, setShowHarmless] = useState(false)

  useEffect(() => {
    const off = window.electronAPI.onConflictsProgress((data) => setProgress(data))
    window.electronAPI.conflictsGetLast().then((last) => { if (last) setResult(last) }).catch(() => {})
    return off
  }, [])

  const scan = async () => {
    const modsFolder = await window.electronAPI.getConfigKey('modsFolder')
    if (!modsFolder) {
      addToast('Please configure your mods folder in Settings first', 'warning')
      setPage('settings')
      return
    }
    setScanning(true)
    setProgress(null)
    setExpanded(new Set())
    let res
    try {
      res = await window.electronAPI.conflictsScan()
    } catch (err) {
      setScanning(false)
      setProgress(null)
      addToast('Scan failed: ' + err.message, 'error')
      return
    }
    setScanning(false)
    setProgress(null)
    if (res?.cancelled) { addToast('Scan cancelled', 'info'); return }
    if (res?.error) { addToast('Scan failed: ' + res.error, 'error'); return }
    setResult(res)
  }

  const dropMod = (relPath) => {
    setResult((r) => r && ({ ...r, pairs: r.pairs.filter((p) => p.a.relPath !== relPath && p.b.relPath !== relPath) }))
  }

  const disable = async (pair, mod) => {
    const other = pair.a.relPath === mod.relPath ? pair.b : pair.a
    const res = await window.electronAPI.modsDisable(mod.relPath, {
      displayName: mod.displayName,
      conflictedWith: other.displayName
    })
    if (!res.success) { addToast(res.error, 'error'); return }
    dropMod(mod.relPath)
    addToast(`${mod.displayName} disabled`, 'success')
    onDisabledChange?.()
  }

  const trash = async (mod) => {
    if (!confirm(`Delete ${mod.displayName}?\n\nIt will be moved to your Recycle Bin.`)) return
    const res = await window.electronAPI.modsTrash('mods', mod.relPath)
    if (!res.success) { addToast(res.error, 'error'); return }
    dropMod(mod.relPath)
    addToast(`${mod.displayName} deleted`, 'success')
  }

  const toggle = (key) => {
    setExpanded((s) => {
      const next = new Set(s)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const scannedAgo = formatAgo(result?.scannedAt)
  const percent = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-heading font-bold text-2xl">Mod Conflicts</h1>
          {scannedAgo && !scanning && (
            <p className="text-xs text-text-muted mt-1">
              Last scanned {scannedAgo} · {result.modCount} mod{result.modCount !== 1 ? 's' : ''} checked
            </p>
          )}
        </div>
        {scanning ? (
          <button onClick={() => window.electronAPI.conflictsCancel()} className="btn-ghost text-sm">
            <i className="fas fa-times" /> Cancel
          </button>
        ) : (
          <button onClick={scan} className="btn-primary text-sm">
            <i className="fas fa-search" /> {result ? 'Rescan' : 'Scan Now'}
          </button>
        )}
      </div>

      {scanning && (
        <div className="glass-card p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted truncate">{progress?.current || 'Reading mods folder...'}</span>
            <span className="text-text-muted shrink-0 ml-3">{progress ? `${progress.done}/${progress.total}` : ''}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
        </div>
      )}

      {!scanning && !result && (
        <div className="empty-state">
          <i className="fas fa-code-branch" />
          <p>Scan your mods folder to find mods that overwrite each other</p>
        </div>
      )}

      {!scanning && result && result.pairs.length === 0 && (
        <div className="empty-state" style={{ color: '#2ecc71' }}>
          <i className="fas fa-check-circle" />
          <p style={{ color: '#94a3b8' }}>No conflicts found across {result.modCount} mods</p>
        </div>
      )}

      {!scanning && result && result.pairs.length > 0 && (
        <>
          <p className="text-sm text-text-muted">
            {result.pairs.length} conflicting pair{result.pairs.length !== 1 ? 's' : ''} found
          </p>

          <div className="flex flex-col gap-3">
            {result.pairs.map((pair) => {
              const key = pairKey(pair)
              const open = expanded.has(key)
              return (
                <div key={key} className="glass-card overflow-hidden">
                  <button onClick={() => toggle(key)} className="w-full px-4 py-3 flex items-center gap-3 text-left">
                    <i className={`fas fa-chevron-${open ? 'down' : 'right'} text-xs text-text-muted w-3`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {pair.a.displayName} <span className="text-text-muted font-normal">vs</span> {pair.b.displayName}
                      </p>
                      <p
                        className="text-xs mt-0.5 truncate"
                        style={{ color: pair.duplicate === 'identical' ? '#94a3b8' : '#f0b429' }}
                      >
                        {pair.symptom.headline}
                      </p>
                      {countsLabel(pair) && (
                        <p className="text-xs text-text-muted mt-0.5 truncate">{countsLabel(pair)}</p>
                      )}
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="pt-3">
                            <p className="text-xs text-text-muted">{pair.symptom.detail}</p>
                            {pair.symptom.loadOrder && (
                              <p className="text-xs text-text-muted mt-1 opacity-70">{loadOrderNote}</p>
                            )}
                          </div>

                          {pair.materials.length > 0 && (
                            <div>
                              <p className="text-xs font-medium mb-1">Materials defined by both</p>
                              <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                                {pair.materials.map((m) => (
                                  <code key={m} className="text-xs text-text-muted truncate">{m}</code>
                                ))}
                              </div>
                            </div>
                          )}

                          {pair.parts.length > 0 && (
                            <div>
                              <p className="text-xs font-medium mb-1">Part names claimed by both</p>
                              <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                                {pair.parts.map((p) => (
                                  <code key={p} className="text-xs text-text-muted">{p}</code>
                                ))}
                              </div>
                            </div>
                          )}

                          {pair.files.length > 0 && (
                            <div>
                              <p className="text-xs font-medium mb-1">Files claimed by both</p>
                              <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                                {pair.files.map((f) => (
                                  <code key={f} className="text-xs text-text-muted truncate">{f}</code>
                                ))}
                              </div>
                            </div>
                          )}

                          {pair.harmless.length > 0 && (
                            <div>
                              <p className="text-xs text-text-muted mb-1">
                                {pair.harmless.length} identical file{pair.harmless.length !== 1 ? 's' : ''} ignored
                              </p>
                              {showHarmless && (
                                <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                                  {pair.harmless.map((f) => (
                                    <code key={f} className="text-xs text-text-muted truncate opacity-60">{f}</code>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {pair.harmlessMaterials.length > 0 && (
                            <p className="text-xs text-text-muted">
                              {pair.harmlessMaterials.length} identical material definition{pair.harmlessMaterials.length !== 1 ? 's' : ''} ignored
                            </p>
                          )}

                          {pair.harmlessParts.length > 0 && (
                            <p className="text-xs text-text-muted">
                              {pair.harmlessParts.length} identical part definition{pair.harmlessParts.length !== 1 ? 's' : ''} ignored
                            </p>
                          )}

                          <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            {[pair.a, pair.b].map((mod) => (
                              <div key={mod.relPath} className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{mod.displayName}</p>
                                  <p className="text-xs text-text-muted truncate">
                                    {mod.relPath}{formatSize(mod.size) ? ` · ${formatSize(mod.size)}` : ''}
                                  </p>
                                </div>
                                <div className="flex gap-1.5">
                                  <button onClick={() => disable(pair, mod)} className="btn-ghost text-xs px-2 py-1.5 flex-1 justify-center">
                                    <i className="fas fa-power-off" /> Disable
                                  </button>
                                  <button onClick={() => trash(mod)} className="btn-danger text-xs px-2 py-1.5">
                                    <i className="fas fa-trash" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col gap-1">
            {result.suppressed > 0 && (
              <button onClick={() => setShowHarmless((v) => !v)} className="text-xs text-text-muted text-left hover:underline">
                {result.suppressed} identical file overlap{result.suppressed !== 1 ? 's' : ''} ignored, {showHarmless ? 'hide' : 'show'} them
              </button>
            )}
            {showHarmless && (
              <p className="text-xs text-text-muted">
                Two mods holding the exact same file is harmless, whichever one BeamNG loads gives the same result. Expand a pair to see which files.
              </p>
            )}
            {result.unreadable.length > 0 && (
              <p className="text-xs text-text-muted">
                {result.unreadable.length} zip{result.unreadable.length !== 1 ? 's' : ''} could not be read and were skipped
              </p>
            )}
            {result.crowded?.length > 0 && (
              <p className="text-xs text-text-muted">
                {result.crowded.length} name{result.crowded.length !== 1 ? 's are' : ' is'} shared by so many mods it's almost certainly a naming convention, not a real conflict, skipped detailed comparison for {result.crowded.map((c) => `"${c.id}" (${c.count} mods)`).join(', ')}
              </p>
            )}
            {result.truncated && (
              <p className="text-xs text-text-muted">
                Too many conflicting pairs to show them all, this list has been cut off. Resolve some of these and rescan to see the rest.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
