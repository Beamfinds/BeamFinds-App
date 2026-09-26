import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useAppStore from '../store/appStore.js'
import useDownloadStore from '../store/downloadStore.js'
import { approveWebLogin } from '../api.js'

const NAV = [
  { id: 'dashboard', icon: 'fa-download', label: 'Downloads' },
  { id: 'installed', icon: 'fa-box', label: 'Installed' },
  { id: 'updates', icon: 'fa-sync-alt', label: 'Updates' },
  { id: 'conflicts', icon: 'fa-code-branch', label: 'Conflicts' },
  //{ id: 'playlist', icon: 'fa-music', label: 'Playlist Creator' },
  { id: 'settings', icon: 'fa-cog', label: 'Settings' },
]

const DISABLED_NAV = { id: 'disabled', icon: 'fa-power-off', label: 'Disabled' }

export default function Sidebar({ updatesBadge, showDisabled }) {
  const { page, setPage, user, token, logout, addToast } = useAppStore()
  const items = showDisabled
    ? [...NAV.slice(0, 4), DISABLED_NAV, ...NAV.slice(4)]
    : NAV
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [approveCode, setApproveCode] = useState('')
  const [approveMsg, setApproveMsg] = useState(null)
  const [approvePending, setApprovePending] = useState(false)

  const handleApprove = async () => {
    if (approveCode.length !== 6) {
      setApproveMsg({ type: 'error', text: 'Please enter a valid 6-digit code' })
      return
    }
    setApprovePending(true)
    const result = await approveWebLogin(approveCode, token)
    setApprovePending(false)
    if (result.success) {
      setApproveMsg({ type: 'success', text: 'Login approved successfully!' })
      setTimeout(() => { setShowApproveModal(false); setApproveCode(''); setApproveMsg(null) }, 1500)
    } else {
      setApproveMsg({ type: 'error', text: result.error || 'Failed to approve login' })
    }
  }

  return (
    <>
      <aside
        className="w-52 shrink-0 flex flex-col py-4"
        style={{ background: 'rgba(2,6,23,0.6)', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        <nav className="flex-1 px-2 flex flex-col gap-0.5">
          {items.map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left group ${page === id
                  ? 'text-primary'
                  : 'text-text-muted hover:text-text-main'
                }`}
            >
              {page === id && (
                <motion.div
                  layoutId="active-nav"
                  className="absolute inset-0 bg-primary/15 rounded-lg -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <motion.i
                whileHover={{ scale: 1.1 }}
                className={`fas ${icon} w-4 text-center text-sm`}
              />
              <span>{label}</span>
              {id === 'updates' && updatesBadge > 0 && (
                <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#e74c3c', color: 'white' }}>
                  {updatesBadge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="px-3 pt-3 flex items-center gap-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="flex-1 text-sm text-text-muted truncate font-medium">{user?.username || 'User'}</span>
          <button
            onClick={() => setShowApproveModal(true)}
            title="Approve Web Login"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
          >
            <i className="fas fa-qrcode text-sm" />
          </button>
          <button
            onClick={() => window.electronAPI.launchBeamNG()}
            title="Launch BeamNG.drive"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-secondary hover:bg-secondary/10 transition-colors"
          >
            <i className="fas fa-play text-sm" />
          </button>
          <button
            onClick={logout}
            title="Logout"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <i className="fas fa-sign-out-alt text-sm" />
          </button>
        </div>
      </aside>

      <AnimatePresence>
        {showApproveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 pointer-events-auto"
              onClick={() => { setShowApproveModal(false); setApproveCode(''); setApproveMsg(null) }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-card p-6 w-80 flex flex-col gap-4 relative z-10 pointer-events-auto"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-bold text-base">Approve Web Login</h3>
                <button onClick={() => { setShowApproveModal(false); setApproveCode(''); setApproveMsg(null) }} className="text-text-muted hover:text-text-main">
                  <i className="fas fa-times" />
                </button>
              </div>
              <p className="text-sm text-text-muted">Enter the 6-digit code displayed on the website:</p>
              <input
                type="text"
                value={approveCode}
                onChange={(e) => setApproveCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-full px-3 py-2 rounded-lg text-center text-xl font-mono tracking-widest outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }}
                autoFocus
              />
              {approveMsg && (
                <p className="text-sm" style={{ color: approveMsg.type === 'success' ? '#2ecc71' : '#e74c3c' }}>{approveMsg.text}</p>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowApproveModal(false); setApproveCode(''); setApproveMsg(null) }} className="btn-ghost text-sm px-3 py-2">Cancel</button>
                <button onClick={handleApprove} disabled={approvePending} className="btn-primary text-sm px-3 py-2">
                  {approvePending ? <><i className="fas fa-spinner fa-spin" /> Verifying...</> : 'Approve'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
