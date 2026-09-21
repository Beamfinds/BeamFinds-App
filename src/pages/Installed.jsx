import { useState, useEffect, useCallback } from 'react'
import useAppStore from '../store/appStore.js'
import { batchModInfo } from '../api.js'

const PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 160"%3E%3Crect fill="%23333" width="280" height="160"/%3E%3Ctext x="140" y="90" text-anchor="middle" fill="%23666" font-size="24"%3E?%3C/text%3E%3C/svg%3E'

export default function Installed() {
  const { token, addToast } = useAppStore()
  const [mods, setMods] = useState([])
  const [loading, setLoading] = useState(true)
  const [showScanModal, setShowScanModal] = useState(false)
  const [scanResults, setScanResults] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [selectedScan, setSelectedScan] = useState(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const downloads = await window.electronAPI.getConfigKey('downloads') || {}
    const modIds = Object.keys(downloads)
    if (!modIds.length) { setMods([]); setLoading(false); return }

    const { mods: info } = await batchModInfo(modIds, token)
    const result = modIds.map((modId) => ({
      modId,
      name: info[modId]?.name || downloads[modId].name || 'Unknown Mod',
      author: info[modId]?.author || downloads[modId].author || 'Unknown',
      version: downloads[modId].version || info[modId]?.version || '1.0.0',
      thumbnail: info[modId]?.thumbnail || null,
      filename: downloads[modId].filename || ''
    }))
    setMods(result)
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const uninstall = async (mod) => {
    if (!confirm('Are you sure you want to uninstall this mod?')) return
    if (mod.filename) await window.electronAPI.deleteModFile(mod.filename)
    const downloads = await window.electronAPI.getConfigKey('downloads') || {}
    delete downloads[mod.modId]
    await window.electronAPI.setConfigKey('downloads', downloads)
    setMods((m) => m.filter((x) => x.modId !== mod.modId))
    addToast('Mod uninstalled', 'success')
  }

  const showInFolder = async (mod) => {
    const modsFolder = await window.electronAPI.getConfigKey('modsFolder')
    if (mod.filename && modsFolder) {
      window.electronAPI.showInFolder(modsFolder + '\\' + mod.filename)
    } else {
      addToast('File location unknown', 'warning')
    }
  }

  const startScan = async () => {
    const modsFolder = await window.electronAPI.getConfigKey('modsFolder')
    if (!modsFolder) { addToast('Please configure your mods folder in Settings first', 'warning'); return }
    setShowScanModal(true)
    setScanning(true)
    setScanResults(null)
    const result = await window.electronAPI.scanModsFolder(modsFolder)
    setScanning(false)
    if (result.error) { addToast('Scan failed: ' + result.error, 'error'); setShowScanModal(false); return }
    const downloads = await window.electronAPI.getConfigKey('downloads') || {}
    const newMods = result.mods.filter((m) => !downloads[m.modId])
    setScanResults(newMods)
    setSelectedScan(new Set(newMods.map((m) => m.modId)))
  }

  const importScanSelected = async () => {
    const downloads = await window.electronAPI.getConfigKey('downloads') || {}
    let count = 0
    for (const modId of selectedScan) {
      const mod = scanResults.find((m) => String(m.modId) === String(modId))
      if (mod && !downloads[modId]) {
        downloads[modId] = { name: mod.name, version: mod.version, filename: mod.filename, author: mod.creator, downloadedAt: mod.uploadedAt || new Date().toISOString() }
        count++
      }
    }
    await window.electronAPI.setConfigKey('downloads', downloads)
    setShowScanModal(false)
    addToast(`Imported ${count} mod(s)`, 'success')
    load()
  }

  const handleImportFile = async (file) => {
    try {
      const text = await file.text()
      const oldData = JSON.parse(text)
      if (typeof oldData !== 'object' || Array.isArray(oldData)) { addToast('Invalid file format', 'error'); return }
      const downloads = await window.electronAPI.getConfigKey('downloads') || {}
      let imported = 0, skipped = 0
      for (const [modId, modData] of Object.entries(oldData)) {
        if (downloads[modId]) { skipped++; continue }
        downloads[modId] = { name: modData.name || 'Unknown Mod', version: modData.version || '1.0.0', filename: modData.filename || '', downloadedAt: modData.downloaded_at ? new Date(modData.downloaded_at * 1000).toISOString() : new Date().toISOString() }
        imported++
      }
      await window.electronAPI.setConfigKey('downloads', downloads)
      setShowImportModal(false)
      if (imported > 0) { addToast(`Imported ${imported} mod(s)${skipped > 0 ? `, ${skipped} skipped` : ''}`, 'success'); load() }
      else { addToast(skipped > 0 ? `All ${skipped} mod(s) already imported` : 'No mods found in file', skipped > 0 ? 'info' : 'warning') }
    } catch (e) { addToast('Failed to import: ' + e.message, 'error') }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-heading font-bold text-2xl">Installed Mods</h1>
        <div className="flex gap-2">
          <button onClick={startScan} className="btn-ghost text-sm"><i className="fas fa-search" /> Scan Folder</button>
          <button onClick={() => setShowImportModal(true)} className="btn-ghost text-sm"><i className="fas fa-file-import" /> Import Old</button>
          <button onClick={load} className="btn-ghost text-sm"><i className="fas fa-sync-alt" /> Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><i className="fas fa-spinner fa-spin" /><p>Loading...</p></div>
      ) : mods.length === 0 ? (
        <div className="empty-state"><i className="fas fa-box-open" /><p>No mods installed yet</p></div>
      ) : (
        <>
          <p className="text-sm text-text-muted">{mods.length} mod{mods.length !== 1 ? 's' : ''} installed</p>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {mods.map((mod) => (
              <div key={mod.modId} className="glass-card overflow-hidden flex flex-col">
                <div className="h-32 overflow-hidden bg-black/20">
                  <img src={mod.thumbnail ? `https://beamfinds.com/uploads/${mod.thumbnail}` : PLACEHOLDER} alt={mod.name} className="w-full h-full object-cover" onError={(e) => { e.target.src = PLACEHOLDER }} />
                </div>
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <div>
                    <p className="font-medium text-sm truncate">{mod.name}</p>
                    <p className="text-xs text-text-muted">by {mod.author} · v{mod.version}</p>
                  </div>
                  <div className="flex gap-1.5 mt-auto">
                    <button onClick={() => showInFolder(mod)} className="btn-ghost text-xs px-2 py-1.5"><i className="fas fa-folder-open" /></button>
                    <button onClick={() => uninstall(mod)} className="btn-danger text-xs px-2 py-1.5 flex-1 justify-center"><i className="fas fa-trash" /> Uninstall</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="glass-card p-6 w-full max-w-md flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base"><i className="fas fa-search mr-2" />Scan Mod Folder</h3>
              <button onClick={() => setShowScanModal(false)} className="text-text-muted hover:text-text-main"><i className="fas fa-times" /></button>
            </div>
            {scanning ? (
              <div className="loading-state py-6"><i className="fas fa-spinner fa-spin" /><p>Scanning...</p></div>
            ) : scanResults === null ? null : scanResults.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">No new mods found</p>
            ) : (
              <>
                <p className="text-sm text-text-muted">Found {scanResults.length} new mod(s)</p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={selectedScan.size === scanResults.length} onChange={(e) => setSelectedScan(e.target.checked ? new Set(scanResults.map((m) => m.modId)) : new Set())} />
                  Select All
                </label>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {scanResults.map((m) => (
                    <label key={m.modId} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                      <input type="checkbox" checked={selectedScan.has(m.modId)} onChange={(e) => { const s = new Set(selectedScan); e.target.checked ? s.add(m.modId) : s.delete(m.modId); setSelectedScan(s) }} />
                      <span className="flex-1 truncate">{m.name}</span>
                      <span className="text-xs text-text-muted">v{m.version}</span>
                    </label>
                  ))}
                </div>
                <button onClick={importScanSelected} disabled={selectedScan.size === 0} className="btn-primary justify-center"><i className="fas fa-download" /> Import Selected</button>
              </>
            )}
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="glass-card p-6 w-full max-w-md flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base"><i className="fas fa-file-import mr-2" />Import from Old App</h3>
              <button onClick={() => setShowImportModal(false)} className="text-text-muted hover:text-text-main"><i className="fas fa-times" /></button>
            </div>
            <div className="text-sm text-text-muted flex flex-col gap-1">
              <p>To find your old downloads file:</p>
              <ol className="list-decimal pl-4 flex flex-col gap-1 mt-1">
                <li>Press <kbd className="px-1 py-0.5 rounded text-xs" style={{ background: 'rgba(255,255,255,0.1)' }}>Win+R</kbd> and type <code className="px-1 rounded text-xs" style={{ background: 'rgba(255,255,255,0.08)' }}>%localappdata%</code></li>
                <li>Find the <strong>BeamFinds</strong> folder</li>
                <li>Copy the <strong>downloads.json</strong> file</li>
              </ol>
            </div>
            <label
              className="flex flex-col items-center gap-3 p-6 rounded-xl cursor-pointer transition-colors text-text-muted hover:text-text-main"
              style={{ border: '2px dashed rgba(255,255,255,0.15)' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImportFile(f) }}
            >
              <i className="fas fa-cloud-upload-alt text-3xl" />
              <p className="text-sm">Drag & drop your downloads.json here</p>
              <span className="text-xs">or</span>
              <input type="file" accept=".json" className="hidden" onChange={(e) => { if (e.target.files[0]) handleImportFile(e.target.files[0]) }} id="import-file" />
              <label htmlFor="import-file" className="btn-primary text-sm cursor-pointer"><i className="fas fa-folder-open" /> Browse Files</label>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
