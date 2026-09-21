const { parentPort, workerData } = require('worker_threads')
const path = require('path')
const fs = require('fs')
const StreamZip = require('node-stream-zip')
const { extractParts } = require('./jbeam')
const { extractMaterials } = require('./materials')

let cancelled = false

parentPort.on('message', (msg) => {
    if (msg === 'cancel') cancelled = true
})

function walkZips(root, dir, out) {
    let entries
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (err) {
        return out
    }

    for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name.toLowerCase() === 'unpacked') continue
            walkZips(root, full, out)
        } else if (entry.name.toLowerCase().endsWith('.zip')) {
            out.push(path.relative(root, full).split(path.sep).join('/'))
        }
    }

    return out
}

async function readJson(zip, entryName) {
    try {
        return JSON.parse((await zip.entryData(entryName)).toString('utf8'))
    } catch (err) {
        return null
    }
}

async function readRecord(modsFolder, relPath, stat) {
    const zip = new StreamZip.async({ file: path.join(modsFolder, relPath), skipEntryNameValidation: true })
    const fileName = relPath.split('/').pop()

    try {
        const entries = await zip.entries()
        const files = {}
        const jbeamEntries = []
        const materialEntries = []
        let markerEntry = null
        let infoEntry = null

        for (const entry of Object.values(entries)) {
            if (entry.isDirectory) continue
            const normalized = entry.name.replace(/\\/g, '/').toLowerCase()
            files[normalized] = entry.crc
            if (normalized.endsWith('.jbeam')) jbeamEntries.push(entry.name)
            const base = normalized.split('/').pop()
            if (base === 'materials.json' || base.endsWith('.materials.json')) materialEntries.push(entry.name)
            if (normalized === 'beamfinds.json' || normalized === 'beamleaks.json') markerEntry = entry.name
            if (!infoEntry && /^mod_info\/[^/]+\/info\.json$/.test(normalized)) infoEntry = entry.name
        }

        let displayName = null
        if (markerEntry) {
            const marker = await readJson(zip, markerEntry)
            if (marker && typeof marker.name === 'string' && marker.name.trim()) {
                displayName = marker.name.trim()
            }
        }
        if (!displayName && infoEntry) {
            const info = await readJson(zip, infoEntry)
            const title = info && (info.Title || info.title)
            if (typeof title === 'string' && title.trim()) displayName = title.trim()
        }
        if (!displayName) displayName = fileName.replace(/\.zip$/i, '')

        const seenParts = new Map()
        for (const entryName of jbeamEntries) {
            if (cancelled) break
            try {
                const text = (await zip.entryData(entryName)).toString('utf8')
                for (const part of extractParts(text)) {
                    if (!seenParts.has(part.name)) seenParts.set(part.name, part.hash)
                }
            } catch (err) {
            }
        }

        const seenMaterials = new Map()
        for (const entryName of materialEntries) {
            if (cancelled) break
            try {
                const text = (await zip.entryData(entryName)).toString('utf8')
                for (const material of extractMaterials(text)) {
                    if (!seenMaterials.has(material.id)) seenMaterials.set(material.id, material.hash)
                }
            } catch (err) {
            }
        }

        return {
            relPath,
            fileName,
            displayName,
            size: stat.size,
            mtime: stat.mtimeMs,
            files,
            parts: [...seenParts].map(([name, hash]) => ({ name, hash })),
            materials: [...seenMaterials].map(([id, hash]) => ({ id, hash }))
        }
    } finally {
        try {
            await zip.close()
        } catch (err) {
        }
    }
}

async function run() {
    const { modsFolder, cache } = workerData
    const relPaths = walkZips(modsFolder, modsFolder, [])
    const records = []
    const unreadable = []

    for (let i = 0; i < relPaths.length; i++) {
        if (cancelled) {
            parentPort.postMessage({ type: 'cancelled' })
            return
        }

        const relPath = relPaths[i]
        parentPort.postMessage({ type: 'progress', done: i, total: relPaths.length, current: relPath })

        let stat
        try {
            stat = fs.statSync(path.join(modsFolder, relPath))
        } catch (err) {
            unreadable.push(relPath)
            continue
        }

        const cached = cache[relPath]
        if (cached && cached.size === stat.size && cached.mtime === stat.mtimeMs) {
            records.push(cached)
            continue
        }

        try {
            records.push(await readRecord(modsFolder, relPath, stat))
        } catch (err) {
            unreadable.push(relPath)
        }
    }

    parentPort.postMessage({ type: 'done', records, unreadable })
}

run().catch((err) => {
    parentPort.postMessage({ type: 'error', message: err.message })
})
