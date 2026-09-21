const { app } = require('electron')
const path = require('path')
const fs = require('fs')

const cacheVersion = 3

function cachePath() {
    return path.join(app.getPath('userData'), 'conflict-cache.json')
}

function readCache(modsFolder) {
    try {
        const raw = JSON.parse(fs.readFileSync(cachePath(), 'utf8'))
        if (raw.version !== cacheVersion) return { entries: {}, last: null }
        if (raw.modsFolder !== modsFolder) return { entries: {}, last: null }
        return { entries: raw.entries || {}, last: raw.last || null }
    } catch (err) {
        return { entries: {}, last: null }
    }
}

function writeCache(modsFolder, entries, last) {
    try {
        fs.writeFileSync(cachePath(), JSON.stringify({ version: cacheVersion, modsFolder, entries, last }))
        return true
    } catch (err) {
        return false
    }
}

function invalidateLast(modsFolder) {
    const { entries } = readCache(modsFolder)
    writeCache(modsFolder, entries, null)
}

module.exports = { readCache, writeCache, invalidateLast }
