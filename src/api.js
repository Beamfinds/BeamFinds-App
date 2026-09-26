const BASE = 'https://beamfinds.com'
const TIMEOUT = 10000

async function req(url, options = {}) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
    clearTimeout(id)
    return res
  } catch (e) {
    clearTimeout(id)
    if (e.name === 'AbortError') throw new Error('Request timed out')
    throw e
  }
}

export async function verifyAppToken(token) {
  try {
    const res = await req(`${BASE}/api/auth/app-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    })
    if (!res.ok) return { success: false, error: (await res.json()).error || 'Verification failed' }
    return res.json()
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function appLogout(token) {
  try {
    const res = await req(`${BASE}/api/auth/app-logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    })
    return res.json()
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function checkBatchUpdates(mods, token) {
  try {
    const res = await req(`${BASE}/api/mods/batch-check-updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify({ mods })
    })
    if (!res.ok) return { updates: [] }
    return res.json()
  } catch {
    return { updates: [] }
  }
}

export async function trackDownload(modId, token) {
  try {
    await req(`${BASE}/api/mods/track-download/${encodeURIComponent(modId)}`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
  } catch {}
}

export async function batchModInfo(modIds, token) {
  try {
    const res = await req(`${BASE}/api/mods/batch-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify({ modIds })
    })
    if (!res.ok) return { mods: {} }
    return res.json()
  } catch {
    return { mods: {} }
  }
}

export async function getCloudConfig(token) {
  try {
    const res = await req(`${BASE}/api/cloud-config`, { headers: { 'Authorization': `Bearer ${token}` } })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export async function saveCloudConfig(config, token) {
  try {
    const res = await req(`${BASE}/api/cloud-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ config })
    })
    return res.json()
  } catch (e) { return { error: e.message } }
}

export async function getCloudConfigStatus(token) {
  try {
    const res = await req(`${BASE}/api/cloud-config/status`, { headers: { 'Authorization': `Bearer ${token}` } })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export async function approveWebLogin(code, token) {
  try {
    const res = await req(`${BASE}/api/auth/app-login/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ code })
    })
    if (!res.ok) return { success: false, error: (await res.json()).error || 'Verification failed' }
    return res.json()
  } catch (e) { return { success: false, error: e.message } }
}

export async function get2FAAppStatus(token) {
  try {
    const res = await req(`${BASE}/api/app/2fa/status`, { headers: { 'Authorization': `Bearer ${token}` } })
    if (!res.ok) return { has2FA: false }
    return res.json()
  } catch { return { has2FA: false } }
}

export async function generate2FACode(token) {
  try {
    const res = await req(`${BASE}/api/app/2fa/generate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    })
    return res.json()
  } catch (e) { return { error: e.message } }
}
