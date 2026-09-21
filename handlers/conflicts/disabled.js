const { ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { invalidateLast } = require('./cache')
const { logger } = require('../logger')

function disabledRoot(modsFolder) {
    return path.join(path.dirname(modsFolder), 'beamfinds', 'disabled')
}

function manifestPath(modsFolder) {
    return path.join(disabledRoot(modsFolder), 'manifest.json')
}

function readManifest(modsFolder) {
    try {
        const data = JSON.parse(fs.readFileSync(manifestPath(modsFolder), 'utf8'))
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
    } catch (err) {
        return {}
    }
}

function writeManifest(modsFolder, data) {
    try {
        fs.mkdirSync(disabledRoot(modsFolder), { recursive: true })
        fs.writeFileSync(manifestPath(modsFolder), JSON.stringify(data, null, 2))
    } catch (err) {
        logger('ERROR', 'conflicts', 'manifest-write-fail', err.message)
    }
}

function safeJoin(root, relPath) {
    if (typeof relPath !== 'string' || !relPath) return null
    const full = path.resolve(root, relPath)
    const rel = path.relative(root, full)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
    if (!full.toLowerCase().endsWith('.zip')) return null
    return full
}

function friendlyError(err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') return 'Close BeamNG.drive and try again'
    if (err.code === 'ENOENT') return 'That file no longer exists'
    if (err.code === 'EACCES') return 'No permission to modify that folder'
    return err.message
}

function moveFile(from, to) {
    fs.mkdirSync(path.dirname(to), { recursive: true })
    try {
        fs.renameSync(from, to)
    } catch (err) {
        if (err.code !== 'EXDEV') throw err
        fs.copyFileSync(from, to)
        fs.unlinkSync(from)
    }
}

function listDisabled(modsFolder) {
    const root = disabledRoot(modsFolder)
    const manifest = readManifest(modsFolder)
    const out = []

    function walk(dir) {
        let entries
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch (err) {
            return
        }

        for (const entry of entries) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                walk(full)
                continue
            }
            if (!entry.name.toLowerCase().endsWith('.zip')) continue

            const relPath = path.relative(root, full).split(path.sep).join('/')
            const meta = manifest[relPath] || {}
            let size = 0
            try {
                size = fs.statSync(full).size
            } catch (err) {
            }

            out.push({
                relPath,
                fileName: entry.name,
                displayName: meta.displayName || entry.name.replace(/\.zip$/i, ''),
                disabledAt: meta.disabledAt || null,
                conflictedWith: meta.conflictedWith || null,
                size
            })
        }
    }

    walk(root)
    return out
}

function registerDisabledHandlers(store) {
    ipcMain.handle('mods-disable', (event, relPath, meta) => {
        const modsFolder = store.get('modsFolder')
        if (!modsFolder) return { success: false, error: 'Mods folder is not configured' }

        const from = safeJoin(modsFolder, relPath)
        const to = safeJoin(disabledRoot(modsFolder), relPath)
        if (!from || !to) return { success: false, error: 'Invalid mod path' }
        if (!fs.existsSync(from)) return { success: false, error: 'That file no longer exists' }
        if (fs.existsSync(to)) return { success: false, error: 'A disabled mod with that name already exists' }

        try {
            moveFile(from, to)
        } catch (err) {
            logger('ERROR', 'conflicts', 'disable-fail', err.message)
            return { success: false, error: friendlyError(err) }
        }

        const manifest = readManifest(modsFolder)
        manifest[relPath] = {
            displayName: (meta && meta.displayName) || null,
            conflictedWith: (meta && meta.conflictedWith) || null,
            disabledAt: new Date().toISOString()
        }
        writeManifest(modsFolder, manifest)
        invalidateLast(modsFolder)
        logger('INFO', 'conflicts', 'disable', relPath)
        return { success: true }
    })

    ipcMain.handle('mods-enable', (event, relPath) => {
        const modsFolder = store.get('modsFolder')
        if (!modsFolder) return { success: false, error: 'Mods folder is not configured' }

        const from = safeJoin(disabledRoot(modsFolder), relPath)
        const to = safeJoin(modsFolder, relPath)
        if (!from || !to) return { success: false, error: 'Invalid mod path' }
        if (!fs.existsSync(from)) return { success: false, error: 'That file no longer exists' }
        if (fs.existsSync(to)) return { success: false, error: 'A mod with that name is already in your mods folder' }

        try {
            moveFile(from, to)
        } catch (err) {
            logger('ERROR', 'conflicts', 'enable-fail', err.message)
            return { success: false, error: friendlyError(err) }
        }

        const manifest = readManifest(modsFolder)
        delete manifest[relPath]
        writeManifest(modsFolder, manifest)
        invalidateLast(modsFolder)
        logger('INFO', 'conflicts', 'enable', relPath)
        return { success: true }
    })

    ipcMain.handle('mods-list-disabled', () => {
        const modsFolder = store.get('modsFolder')
        if (!modsFolder) return []
        return listDisabled(modsFolder)
    })

    ipcMain.handle('mods-trash', async (event, scope, relPath) => {
        const modsFolder = store.get('modsFolder')
        if (!modsFolder) return { success: false, error: 'Mods folder is not configured' }
        if (scope !== 'mods' && scope !== 'disabled') return { success: false, error: 'Invalid scope' }

        const root = scope === 'mods' ? modsFolder : disabledRoot(modsFolder)
        const target = safeJoin(root, relPath)
        if (!target) return { success: false, error: 'Invalid mod path' }
        if (!fs.existsSync(target)) return { success: false, error: 'That file no longer exists' }

        try {
            await shell.trashItem(target)
        } catch (err) {
            logger('ERROR', 'conflicts', 'trash-fail', err.message)
            return { success: false, error: friendlyError(err) }
        }

        if (scope === 'disabled') {
            const manifest = readManifest(modsFolder)
            delete manifest[relPath]
            writeManifest(modsFolder, manifest)
        }
        invalidateLast(modsFolder)
        logger('INFO', 'conflicts', 'trash', `${scope}/${relPath}`)
        return { success: true }
    })
}

module.exports = { registerDisabledHandlers }
