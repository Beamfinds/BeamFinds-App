import { useState, useEffect } from 'react'
import useAppStore from '../store/appStore.js'
import useDownloadStore from '../store/downloadStore.js'
import { getCloudConfigStatus, saveCloudConfig, getCloudConfig, get2FAAppStatus, generate2FACode } from '../api.js'

export default function Settings() {
  const { token, user, logout, addToast } = useAppStore()
  const { setMaxConcurrent } = useDownloadStore()

  const [modsFolder, setModsFolder] = useState('')
  const [customFolder, setCustomFolder] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [maxDownloads, setMaxDownloads] = useState(3)
  const [discordRpc, setDiscordRpc] = useState(false)
  const [buildInfo, setBuildInfo] = useState(null)
  const [cloudStatus, setCloudStatus] = useState(null)
  const [cloudMsg, setCloudMsg] = useState(null)
  const [has2FA, setHas2FA] = useState(false)
  const [tfaCode, setTfaCode] = useState(null)
  const [tfaExpiry, setTfaExpiry] = useState(null)
  const [tfaGenerating, setTfaGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [mf, cf, uc, md, drpc, bi] = await Promise.all([
        window.electronAPI.getConfigKey('modsFolder'),
        window.electronAPI.getConfigKey('customFolder'),
        window.electronAPI.getConfigKey('useCustomFolder'),
        window.electronAPI.getConfigKey('maxDownloads'),
        window.electronAPI.getDiscordRpcEnabled(),
        window.electronAPI.isBetaBuild()
      ])
      setModsFolder(mf || '')
      setCustomFolder(cf || '')
      setUseCustom(uc || false)
      setMaxDownloads(md || 3)
      setDiscordRpc(drpc)
      setBuildInfo(bi)
    }
    load()
    getCloudConfigStatus(token).then(setCloudStatus)
    get2FAAppStatus(token).then((r) => setHas2FA(r.has2FA))
  }, [token])

  const save = async () => {
    if (!modsFolder) { addToast('Please select a mods folder', 'warning'); return }
    if (useCustom && !customFolder) { addToast('Please select a custom folder or disable the option', 'warning'); return }
    await window.electronAPI.setConfig('modsFolder', modsFolder)
    await window.electronAPI.setConfig('useCustomFolder', useCustom)
    await window.electronAPI.setConfig('customFolder', customFolder)
    await window.electronAPI.setConfig('maxDownloads', maxDownloads)
    setMaxConcurrent(maxDownloads)
    addToast('Settings saved!', 'success')
  }

  const browseMods = async () => { const p = await window.electronAPI.selectFolder(); if (p) setModsFolder(p) }
  const autoDetect = async () => { const p = await window.electronAPI.findBeamNGMods(); if (p) { setModsFolder(p); addToast('Auto-detected mods folder!', 'success') } else addToast('Could not find mods folder', 'warning') }
  const browseCustom = async () => { const p = await window.electronAPI.selectFolder(); if (p) setCustomFolder(p) }

  const handleDiscordToggle = async (e) => {
    setDiscordRpc(e.target.checked)
    await window.electronAPI.setDiscordRpcEnabled(e.target.checked)
    addToast(e.target.checked ? 'Discord RPC enabled' : 'Discord RPC disabled', 'success')
  }

  const backupCloud = async () => {
    setCloudMsg({ type: 'loading', text: 'Backing up...' })
    const config = await window.electronAPI.getFullConfig()
    const result = await saveCloudConfig(config, token)
    if (result.error) { setCloudMsg({ type: 'error', text: 'Backup failed: ' + result.error }); addToast('Backup failed', 'error') }
    else { setCloudMsg({ type: 'success', text: 'Backed up successfully!' }); addToast('Config backed up to cloud', 'success'); getCloudConfigStatus(token).then(setCloudStatus) }
  }

  const restoreCloud = async () => {
    setCloudMsg({ type: 'loading', text: 'Restoring...' })
    const result = await getCloudConfig(token)
    if (!result?.config) { setCloudMsg({ type: 'warning', text: 'No backup found' }); addToast('No cloud backup found', 'warning'); return }
    for (const [key, value] of Object.entries(result.config)) { await window.electronAPI.setConfigKey(key, value) }
    setCloudMsg({ type: 'success', text: 'Restored successfully!' })
    addToast('Config restored from cloud', 'success')
  }

  const genTFA = async () => {
    setTfaGenerating(true)
    const result = await generate2FACode(token)
    setTfaGenerating(false)
    if (result.error) { addToast(result.error, 'error'); return }
    setTfaCode(result.code)
    setTfaExpiry(result.expiresAt)
    const interval = setInterval(() => {
      if (Date.now() >= result.expiresAt) { setTfaCode(null); setTfaExpiry(null); clearInterval(interval) }
    }, 1000)
  }

  const tfaRemaining = tfaExpiry ? Math.max(0, Math.floor((tfaExpiry - Date.now()) / 1000)) : 0

  const exportLogs = async () => {
    setExporting(true)
    try {
      const content = await window.electronAPI.exportLogs()
      const result = await window.electronAPI.saveLogs(content)
      if (result?.cancelled) return
      if (result?.success) addToast('Logs exported', 'success')
      else addToast('Failed to save logs', 'error')
    } catch {
      addToast('Failed to export logs', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <h1 className="font-heading font-bold text-2xl">Settings</h1>

      <div className="glass-card p-5 flex flex-col gap-4">
        <h2 className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wide flex items-center gap-2"><i className="fas fa-user" /> Account</h2>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-heading font-bold text-lg" style={{ background: 'rgba(52,152,219,0.2)', color: '#3498db' }}>
            {(user?.username || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">{user?.username || 'User'}</p>
            <p className="text-xs text-text-muted">{user?.email || ''}</p>
          </div>
          <button onClick={logout} className="btn-ghost text-sm"><i className="fas fa-sign-out-alt" /> Logout</button>
        </div>
      </div>

      <div className="glass-card p-5 flex flex-col gap-4">
        <h2 className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wide flex items-center gap-2"><i className="fas fa-folder" /> Download Location</h2>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-muted">BeamNG Mods Folder</label>
          <div className="flex gap-2">
            <input value={modsFolder} readOnly placeholder="Select your mods folder" className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc' }} />
            <button onClick={browseMods} className="btn-ghost text-sm px-3 py-2">Browse</button>
            <button onClick={autoDetect} className="btn-ghost text-sm px-3 py-2">Auto-Detect</button>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} />
          <span>Use custom download folder</span>
        </label>
        {useCustom && (
          <div className="flex gap-2">
            <input value={customFolder} readOnly placeholder="Select custom folder" className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc' }} />
            <button onClick={browseCustom} className="btn-ghost text-sm px-3 py-2">Browse</button>
          </div>
        )}
      </div>

      <div className="glass-card p-5 flex flex-col gap-4">
        <h2 className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wide flex items-center gap-2"><i className="fas fa-sliders-h" /> Download Settings</h2>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-muted">Max Concurrent Downloads: {maxDownloads}</label>
          <input type="range" min={1} max={5} value={maxDownloads} onChange={(e) => setMaxDownloads(Number(e.target.value))} className="w-full accent-primary" />
          <p className="text-xs text-text-muted">1 = one at a time, 5 = up to 5 simultaneously</p>
        </div>
      </div>

      <div className="glass-card p-5 flex flex-col gap-4">
        <h2 className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wide flex items-center gap-2"><i className="fab fa-discord" /> Discord Integration</h2>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={discordRpc} onChange={handleDiscordToggle} />
          <span>Enable Discord Rich Presence</span>
        </label>
      </div>

      <div className="glass-card p-5 flex flex-col gap-4">
        <h2 className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wide flex items-center gap-2"><i className="fas fa-cloud" /> Cloud Backup</h2>
        {cloudStatus && (
          <p className="text-xs text-text-muted flex items-center gap-1">
            {cloudStatus.hasBackup ? <><i className="fas fa-check-circle" style={{ color: '#2ecc71' }} /> Last backup: {new Date(cloudStatus.updatedAt).toLocaleString()}</> : <><i className="fas fa-cloud" /> No cloud backup found</>}
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={backupCloud} className="btn-ghost text-sm"><i className="fas fa-cloud-upload-alt" /> Backup</button>
          <button onClick={restoreCloud} className="btn-ghost text-sm"><i className="fas fa-cloud-download-alt" /> Restore</button>
        </div>
        {cloudMsg && (
          <p className="text-xs" style={{ color: cloudMsg.type === 'success' ? '#2ecc71' : cloudMsg.type === 'error' ? '#e74c3c' : '#94a3b8' }}>{cloudMsg.text}</p>
        )}
      </div>

      {has2FA && (
        <div className="glass-card p-5 flex flex-col gap-4">
          <h2 className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wide flex items-center gap-2"><i className="fas fa-shield-alt" /> Two-Factor Authentication</h2>
          {tfaCode ? (
            <div className="flex flex-col items-center gap-2">
              <span className="font-mono font-bold text-3xl tracking-widest" style={{ color: '#3498db' }}>{tfaCode}</span>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${(tfaRemaining / 60) * 100}%`, background: '#3498db' }} />
              </div>
              <span className="text-xs text-text-muted">Expires in {tfaRemaining}s</span>
            </div>
          ) : (
            <button onClick={genTFA} disabled={tfaGenerating} className="btn-primary text-sm self-start">
              {tfaGenerating ? <><i className="fas fa-spinner fa-spin" /> Generating...</> : <><i className="fas fa-key" /> Generate Code</>}
            </button>
          )}
        </div>
      )}

      {buildInfo?.isBeta && (
        <div className="glass-card p-5 flex flex-col gap-4">
          <h2 className="font-heading font-semibold text-sm text-text-muted uppercase tracking-wide flex items-center gap-2"><i className="fas fa-bug" /> Beta / Debug</h2>
          <p className="text-xs text-text-muted">Export a detailed log file for developer inspection.</p>
          <button onClick={exportLogs} disabled={exporting} className="btn-ghost text-sm self-start">
            {exporting
              ? <><i className="fas fa-spinner fa-spin" /> Exporting...</>
              : <><i className="fas fa-file-download" /> Export Logs</>}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button onClick={save} className="btn-primary"><i className="fas fa-save" /> Save Settings</button>
        {buildInfo && (
          <p className="text-xs text-text-muted">{buildInfo.isBeta ? 'Beta' : 'Stable'} v{buildInfo.isBeta ? buildInfo.version : buildInfo.NonBetaVersion}</p>
        )}
      </div>
    </div>
  )
}
