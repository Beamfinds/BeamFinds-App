export default function Titlebar() {
  return (
    <div
      className="flex items-center justify-between h-10 shrink-0 px-4"
      style={{ background: 'rgba(2,6,23,0.95)', borderBottom: '1px solid rgba(255,255,255,0.06)', WebkitAppRegion: 'drag' }}
    >
      <div className="font-heading font-bold text-base select-none">
        <span className="text-text-main">Beam</span>
        <span style={{ color: '#3498db', textShadow: '0 0 16px rgba(52,152,219,0.5)' }}>Finds</span>
      </div>

      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' }}>
        <button
          onClick={() => window.electronAPI.minimize()}
          className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-main hover:bg-white/10 transition-colors rounded"
        >
          <i className="fas fa-minus text-xs" />
        </button>
        <button
          onClick={() => window.electronAPI.maximize()}
          className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-main hover:bg-white/10 transition-colors rounded"
        >
          <i className="fas fa-square text-xs" />
        </button>
        <button
          onClick={() => window.electronAPI.close()}
          className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-accent hover:bg-accent/15 transition-colors rounded"
        >
          <i className="fas fa-times text-xs" />
        </button>
      </div>
    </div>
  )
}
