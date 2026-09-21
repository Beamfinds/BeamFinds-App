import { useState, useEffect } from 'react'
import useAppStore from '../store/appStore.js'

export default function Playlist() {
  const { addToast } = useAppStore()
  const [tab, setTab] = useState('create')
  const [source, setSource] = useState(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [songs, setSongs] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [playlistName, setPlaylistName] = useState('')
  const [playlists, setPlaylists] = useState([])
  const [editingPlaylist, setEditingPlaylist] = useState(null)
  const [depStatus, setDepStatus] = useState(null)
  const [creationProgress, setCreationProgress] = useState(null)
  const [creating, setCreating] = useState(false)
  const [loadingSource, setLoadingSource] = useState(false)
  const [editSongs, setEditSongs] = useState([])
  const [dragIdx, setDragIdx] = useState(null)

  useEffect(() => {
    window.electronAPI.onPlaylistDependencyProgress((data) => setDepStatus(data))
    window.electronAPI.onPlaylistCreationProgress((data) => setCreationProgress(data))
  }, [])

  const loadPlaylists = async () => {
    const result = await window.electronAPI.playlistGetCreated()
    setPlaylists(result?.playlists || [])
  }

  useEffect(() => { if (tab === 'manage') loadPlaylists() }, [tab])

  const checkDeps = async (src) => {
    setSource(src)
    setDepStatus({ status: 'checking' })
    const result = await window.electronAPI.playlistCheckDependencies(src)
    if (result.ready) { setDepStatus(null) }
    else { setDepStatus({ status: 'missing', missing: result.missing }) }
  }

  const installDep = async (dep) => {
    setDepStatus({ status: 'installing', depName: dep })
    await window.electronAPI.playlistInstallDependency(dep)
  }

  const fetchSongs = async () => {
    if (!sourceUrl.trim()) { addToast('Please enter a URL', 'warning'); return }
    setLoadingSource(true)
    setSongs([])
    const result = await window.electronAPI.playlistFetchInfo(sourceUrl, source)
    setLoadingSource(false)
    if (result.error) { addToast(result.error, 'error'); return }
    setSongs(result.songs || [])
    setSelected(new Set((result.songs || []).map((_, i) => i)))
    if (result.name) setPlaylistName(result.name)
  }

  const loadLocal = async () => {
    const files = await window.electronAPI.selectMp3Files()
    if (!files || !files.length) return
    setLoadingSource(true)
    const result = await window.electronAPI.playlistProcessLocalFiles(files)
    setLoadingSource(false)
    setSongs(result.songs || [])
    setSelected(new Set((result.songs || []).map((_, i) => i)))
  }

  const createPlaylist = async () => {
    if (!playlistName.trim()) { addToast('Please enter a playlist name', 'warning'); return }
    const chosen = songs.filter((_, i) => selected.has(i))
    if (!chosen.length) { addToast('Please select at least one song', 'warning'); return }
    setCreating(true)
    setCreationProgress(null)
    const result = await window.electronAPI.playlistCreateMod(playlistName, chosen, sourceUrl || null)
    setCreating(false)
    if (result.error) { addToast(result.error, 'error') }
    else { addToast(`Playlist "${playlistName}" created!`, 'success'); resetCreate() }
  }

  const resetCreate = () => { setSource(null); setSongs([]); setSelected(new Set()); setPlaylistName(''); setSourceUrl(''); setCreationProgress(null); setDepStatus(null) }

  const deletePlaylist = async (filename) => {
    if (!confirm('Delete this playlist?')) return
    await window.electronAPI.playlistDelete(filename)
    addToast('Playlist deleted', 'success')
    loadPlaylists()
  }

  const startEdit = async (pl) => {
    const result = await window.electronAPI.playlistGetSongs(pl.filename)
    setEditingPlaylist(pl)
    setEditSongs(result.songs || [])
  }

  const saveEdit = async () => {
    const result = await window.electronAPI.playlistUpdate(editingPlaylist.name, editingPlaylist.filename, editSongs)
    if (result.error) { addToast(result.error, 'error') }
    else { addToast('Playlist updated!', 'success'); setEditingPlaylist(null); loadPlaylists() }
  }

  const SOURCES = [
    { id: 'youtube', icon: 'fab fa-youtube', label: 'YouTube Music', desc: 'Import from a YouTube Music playlist URL', color: '#ff0000' },
    { id: 'spotify', icon: 'fab fa-spotify', label: 'Spotify', desc: 'Import from Spotify, downloads from YouTube', color: '#1db954', beta: true },
    { id: 'local', icon: 'fas fa-folder-open', label: 'Local MP3s', desc: 'Import MP3 files from your computer', color: '#3498db' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading font-bold text-2xl flex items-center gap-2"><i className="fas fa-music text-primary" /> Playlist Creator</h1>

      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {['create', 'manage'].map((t) => (
          <button key={t} onClick={() => { setTab(t); resetCreate() }} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? 'bg-primary text-white' : 'text-text-muted hover:text-text-main'}`}>
            <i className={`fas ${t === 'create' ? 'fa-plus' : 'fa-list'} mr-1.5`} />{t === 'create' ? 'Create New' : 'My Playlists'}
          </button>
        ))}
      </div>

      {tab === 'create' && (
        <>
          {!source && (
            <div className="flex flex-col gap-3">
              <h2 className="font-heading font-semibold text-base">Choose Import Source</h2>
              <div className="grid grid-cols-3 gap-3">
                {SOURCES.map((s) => (
                  <button key={s.id} onClick={() => checkDeps(s.id)} className="glass-card p-5 flex flex-col items-center gap-3 text-center hover:border-white/20 transition-all">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: `${s.color}18` }}>
                      <i className={s.icon} style={{ color: s.color }} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{s.label} {s.beta && <span className="text-xs px-1 py-0.5 rounded" style={{ background: 'rgba(52,152,219,0.2)', color: '#3498db' }}>BETA</span>}</p>
                      <p className="text-xs text-text-muted mt-0.5">{s.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {source && depStatus?.status === 'checking' && <div className="loading-state"><i className="fas fa-spinner fa-spin" /><p>Checking dependencies...</p></div>}

          {source && depStatus?.status === 'missing' && (
            <div className="glass-card p-5 flex flex-col gap-3">
              <p className="font-medium text-sm">Missing dependencies:</p>
              {depStatus.missing.map((dep) => (
                <div key={dep} className="flex items-center gap-3">
                  <span className="text-sm flex-1">{dep}</span>
                  <button onClick={() => installDep(dep)} className="btn-primary text-xs px-3 py-1.5"><i className="fas fa-download" /> Install</button>
                  <button onClick={() => window.electronAPI.playlistOpenDependencyUrl(dep)} className="btn-ghost text-xs px-3 py-1.5"><i className="fas fa-external-link-alt" /></button>
                </div>
              ))}
            </div>
          )}

          {source && depStatus?.status === 'installing' && <div className="loading-state"><i className="fas fa-spinner fa-spin" /><p>Installing {depStatus.depName}...</p></div>}

          {source && !depStatus && (
            <>
              <button onClick={resetCreate} className="btn-ghost text-sm self-start"><i className="fas fa-arrow-left" /> Back</button>

              {source !== 'local' ? (
                <div className="flex gap-2">
                  <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder={source === 'youtube' ? 'YouTube Music playlist URL...' : 'Spotify playlist URL...'} className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }} onKeyDown={(e) => e.key === 'Enter' && fetchSongs()} />
                  <button onClick={fetchSongs} disabled={loadingSource} className="btn-primary text-sm">
                    {loadingSource ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-search" /> Fetch</>}
                  </button>
                </div>
              ) : (
                <button onClick={loadLocal} disabled={loadingSource} className="btn-ghost text-sm self-start">
                  {loadingSource ? <><i className="fas fa-spinner fa-spin" /> Loading...</> : <><i className="fas fa-folder-open" /> Select MP3 Files</>}
                </button>
              )}

              {songs.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <input value={playlistName} onChange={(e) => setPlaylistName(e.target.value)} placeholder="Playlist name..." className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={selected.size === songs.length} onChange={(e) => setSelected(e.target.checked ? new Set(songs.map((_, i) => i)) : new Set())} />
                      Select All ({selected.size}/{songs.length})
                    </label>
                  </div>
                  <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                    {songs.map((s, i) => (
                      <label key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-white/5 text-sm">
                        <input type="checkbox" checked={selected.has(i)} onChange={(e) => { const ns = new Set(selected); e.target.checked ? ns.add(i) : ns.delete(i); setSelected(ns) }} />
                        <span className="flex-1 truncate">{s.title || s.name}</span>
                        {s.duration && <span className="text-xs text-text-muted">{s.duration}</span>}
                      </label>
                    ))}
                  </div>
                  {creationProgress && (
                    <div className="glass-card p-3 text-sm text-text-muted">
                      {creationProgress.message || `${creationProgress.current}/${creationProgress.total}`}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={createPlaylist} disabled={creating || selected.size === 0} className="btn-primary text-sm">
                      {creating ? <><i className="fas fa-spinner fa-spin" /> Creating...</> : <><i className="fas fa-plus" /> Create Playlist</>}
                    </button>
                    {creating && <button onClick={() => window.electronAPI.playlistCancelCreation()} className="btn-ghost text-sm">Cancel</button>}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'manage' && (
        <>
          {editingPlaylist ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setEditingPlaylist(null)} className="btn-ghost text-sm"><i className="fas fa-arrow-left" /> Back</button>
                <h2 className="font-heading font-semibold">{editingPlaylist.name}</h2>
              </div>
              <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
                {editSongs.map((s, i) => (
                  <div key={i} draggable onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragIdx === null || dragIdx === i) return; const ns = [...editSongs]; const [item] = ns.splice(dragIdx, 1); ns.splice(i, 0, item); setEditSongs(ns); setDragIdx(null) }} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/5 cursor-move">
                    <i className="fas fa-grip-vertical text-text-muted text-xs" />
                    <span className="flex-1 truncate">{s.title || s.name}</span>
                    <button onClick={() => setEditSongs(editSongs.filter((_, j) => j !== i))} className="text-text-muted hover:text-accent transition-colors"><i className="fas fa-times text-xs" /></button>
                  </div>
                ))}
              </div>
              <button onClick={saveEdit} className="btn-primary text-sm self-start"><i className="fas fa-save" /> Save Changes</button>
            </div>
          ) : playlists.length === 0 ? (
            <div className="empty-state"><i className="fas fa-music" /><p>No playlists created yet</p></div>
          ) : (
            <div className="flex flex-col gap-2">
              {playlists.map((pl) => (
                <div key={pl.filename} className="glass-card px-4 py-3 flex items-center gap-3">
                  <i className="fas fa-music text-primary" />
                  <span className="flex-1 font-medium text-sm">{pl.name}</span>
                  <span className="text-xs text-text-muted">{pl.songs} songs</span>
                  <button onClick={() => startEdit(pl)} className="btn-ghost text-xs px-3 py-1.5"><i className="fas fa-edit" /> Edit</button>
                  <button onClick={() => deletePlaylist(pl.filename)} className="btn-danger text-xs px-3 py-1.5"><i className="fas fa-trash" /></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
