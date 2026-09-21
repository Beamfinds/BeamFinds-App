export function formatSize(bytes) {
  if (!bytes) return null
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatSpeed(bytesPerSec) {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
}

export function formatEta(s) {
  if (!s || s <= 0) return '--'
  const minutes = s / 60
  if (minutes < 1) return `${Math.round(s)}s`
  if (minutes < 60) return `${minutes.toFixed(1)} min`
  const hours = minutes / 60
  return `${hours.toFixed(1)} h`
}
