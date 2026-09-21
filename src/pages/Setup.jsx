import { useState, useEffect } from 'react'
import useAppStore from '../store/appStore.js'

export default function Setup() {
  const { onSetupComplete, addToast } = useAppStore()
  const [detectedPath, setDetectedPath] = useState(null)
  const [selectedPath, setSelectedPath] = useState(null)
  const [detecting, setDetecting] = useState(true)

  useEffect(() => {
    window.electronAPI.findBeamNGMods().then((path) => {
      setDetecting(false)
      if (path) setDetectedPath(path)
    })
  }, [])

  const handleContinue = async (path) => {
    await window.electronAPI.setConfigKey('modsFolder', path)
    addToast('Mods folder configured!', 'success')
    onSetupComplete()
  }

  const handleManual = async () => {
    const path = await window.electronAPI.selectFolder()
    if (path) {
      setSelectedPath(path)
      setDetectedPath(null)
    }
  }

  const activePath = detectedPath || selectedPath

  return (
    <div className="flex-1 flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(52,152,219,0.07) 0%, transparent 70%)' }}>
      <div className="glass-card p-8 w-full max-w-md flex flex-col gap-6">
        <div className="text-center">
          <h1 className="font-heading font-bold text-2xl mb-1">
            Welcome to <span className="text-text-main">Beam</span><span style={{ color: '#3498db' }}>Finds</span>
          </h1>
          <p className="text-text-muted text-sm">Let's set up your mods folder</p>
        </div>

        <div className="flex flex-col items-center gap-2 py-2">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: 'rgba(52,152,219,0.1)', border: '1px solid rgba(52,152,219,0.2)' }}>
            <i className="fas fa-folder-open text-primary text-xl" />
          </div>
          <p className="text-sm text-text-muted text-center">We need to know where your BeamNG.drive mods folder is located.</p>
        </div>

        <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {detecting ? (
            <><i className="fas fa-spinner fa-spin text-text-muted" /><span className="text-text-muted">Detecting...</span></>
          ) : activePath ? (
            <><i className="fas fa-check-circle" style={{ color: '#2ecc71' }} /><span className="text-text-main truncate">{activePath}</span></>
          ) : (
            <><i className="fas fa-exclamation-triangle" style={{ color: '#f39c12' }} /><span className="text-text-muted">Could not auto-detect mods folder</span></>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleContinue(activePath)}
            disabled={!activePath}
            className="btn-primary w-full justify-center py-2.5"
          >
            <i className="fas fa-check" /> Continue
          </button>
          <button onClick={handleManual} className="btn-ghost w-full justify-center py-2.5">
            <i className="fas fa-folder" /> Select Manually
          </button>
        </div>
      </div>
    </div>
  )
}
