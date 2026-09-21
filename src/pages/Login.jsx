import { useState, useEffect } from 'react'
import useAppStore from '../store/appStore.js'

export default function Login() {
  const { loginWithToken, addToast } = useAppStore()
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  useEffect(() => {
    window.electronAPI.onProtocolAuth(async (data) => {
      if (!data?.token) return
      setStatus('verifying')
      setError(null)
      const result = await loginWithToken(data.token)
      if (!result.success) {
        setStatus('idle')
        setError(result.error || 'Authentication failed')
      }
    })
  }, [])

  const handleLogin = async () => {
    setStatus('opening')
    setError(null)
    try {
      await window.electronAPI.openBrowserLogin()
      setStatus('waiting')
    } catch {
      setStatus('idle')
      setError('Failed to open browser')
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(52,152,219,0.08) 0%, transparent 70%)' }}>
      <div className="glass-card p-8 w-full max-w-sm flex flex-col gap-6 text-center">
        <div>
          <h1 className="font-heading font-bold text-3xl mb-1">
            <span className="text-text-main">Beam</span>
            <span style={{ color: '#3498db', textShadow: '0 0 20px rgba(52,152,219,0.5)' }}>Finds</span>
          </h1>
          <p className="text-text-muted text-sm">Sign in to continue</p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(52,152,219,0.12)', border: '1px solid rgba(52,152,219,0.2)' }}>
            <i className="fas fa-desktop text-primary text-2xl" />
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            Click the button below to sign in via your browser. You'll be redirected back automatically.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleLogin}
            disabled={status !== 'idle'}
            className="btn-primary w-full justify-center py-3 text-sm"
          >
            {status === 'opening' ? <><i className="fas fa-spinner fa-spin" /> Opening browser...</> :
             status === 'waiting' || status === 'verifying' ? <><i className="fas fa-spinner fa-spin" /> {status === 'verifying' ? 'Verifying...' : 'Waiting for auth...'}</> :
             <><i className="fas fa-external-link-alt" /> Sign In with Browser</>}
          </button>

          {error && (
            <p className="text-sm" style={{ color: '#e74c3c' }}>{error}</p>
          )}
        </div>

        <p className="text-xs text-text-muted">
          Don't have an account?{' '}
          <button onClick={() => window.electronAPI.openBrowserLogin()} className="hover:text-primary transition-colors" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            Register at beamfinds.com
          </button>
        </p>
      </div>
    </div>
  )
}
